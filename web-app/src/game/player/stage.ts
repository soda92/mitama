import type { AssetMap, Command } from "../types";
import { clearBlackBackground } from "../chroma";
import { IMAGE_CACHE_MAX, RENDER_SCALE, STAGE_H, STAGE_W, TRANSITION_MS } from "./constants";

type ImageSource = HTMLImageElement | HTMLCanvasElement;

export interface StageSnapshot {
  bg?: string;
  bgs?: string[];
  l?: string;
  r?: string;
  c?: string;
}

export interface StageImage {
  name: string;
  img: ImageSource;
}

export interface Stage {
  bgs: StageImage[];
  l: StageImage | null;
  r: StageImage | null;
  c: StageImage | null;
}

export type Slot = "l" | "r" | "c";
type BmpSlot = Slot | "bg";

export function emptyStage(): Stage {
  return { bgs: [], l: null, r: null, c: null };
}

export class StageRenderer {
  private stage: Stage = emptyStage();
  private pendingStage: Stage | null = null;
  private pendingLoads: Promise<void>[] = [];
  private frameCache: HTMLCanvasElement | null = null;
  private stageDirty = true;
  private readonly imageCache = new Map<string, ImageSource>();
  private readonly imagePromises = new Map<string, Promise<ImageSource>>();
  private readonly spriteCache = new Map<string, HTMLCanvasElement>();
  private readonly hdScales = new Map<string, number>();

  constructor(
    private readonly pack: string,
    private readonly assets: AssetMap,
    private readonly log: (text: string) => void,
    private readonly isPaused: () => boolean,
    private readonly isStopped: () => boolean,
  ) {}

  get value(): Stage {
    return this.stage;
  }

  get hasPending(): boolean {
    return this.pendingStage !== null;
  }

  reset(): void {
    this.stage = emptyStage();
    this.pendingStage = null;
    this.pendingLoads = [];
    this.frameCache = null;
    this.stageDirty = true;
  }

  setStage(stage: Stage): void {
    this.stage = stage;
    this.markDirty();
  }

  snapshot(): StageSnapshot {
    const stage: StageSnapshot = {};
    if (this.stage.bgs.length > 0) {
      stage.bgs = this.stage.bgs.map((b) => b.name);
      stage.bg = stage.bgs[stage.bgs.length - 1];
    }
    if (this.stage.l) stage.l = this.stage.l.name;
    if (this.stage.r) stage.r = this.stage.r.name;
    if (this.stage.c) stage.c = this.stage.c.name;
    return stage;
  }

  beginPending(): void {
    this.pendingStage ??= {
      bgs: [...this.stage.bgs],
      l: this.stage.l,
      r: this.stage.r,
      c: this.stage.c,
    };
  }

  queueBmp(args: string[]): void {
    this.beginPending();
    if (!this.pendingStage) return;
    this.pendingLoads.push(this.applyBmp(this.pendingStage, args));
  }

  async commitPending(
    kind: string,
    ctx: CanvasRenderingContext2D,
    drawOverlay: () => void,
  ): Promise<void> {
    if (!this.pendingStage) return;
    await Promise.all(this.pendingLoads);
    this.pendingLoads = [];
    const next = this.pendingStage;
    this.pendingStage = null;
    await this.transitionTo(next, kind, ctx, drawOverlay);
  }

  async restoreBackgrounds(names: string[]): Promise<void> {
    this.stage.bgs = [];
    this.markDirty();
    for (const name of names) {
      const img = await this.loadImage(name);
      this.stage.bgs.push({ name, img });
    }
  }

  async restoreSlot(slot: Slot, name?: string): Promise<void> {
    if (!name) return;
    const img = await this.loadImage(name);
    this.stage[slot] = { name, img };
    this.markDirty();
  }

  async applyBmp(stage: Stage, args: string[]): Promise<void> {
    const name = (
      args.find((a) => !["L", "R", "C", "消去"].includes(a.toUpperCase())) ?? "BLACK"
    ).toUpperCase();
    const clear = args.includes("消去");
    const posArg = args.find((a) => ["L", "R", "C"].includes(a.toUpperCase()));
    const slot: BmpSlot =
      posArg?.toUpperCase() === "L"
        ? "l"
        : posArg?.toUpperCase() === "R"
          ? "r"
          : posArg?.toUpperCase() === "C"
            ? "c"
            : "bg";

    if (clear) {
      if (name === "ALL") {
        stage.bgs = [];
        stage.l = null;
        stage.r = null;
        stage.c = null;
      } else if (slot !== "bg") {
        stage[slot] = null;
      } else {
        for (let i = stage.bgs.length - 1; i >= 0; i--) {
          if (stage.bgs[i].name.toUpperCase() === name) {
            stage.bgs.splice(i, 1);
            break;
          }
        }
      }
      return;
    }
    if (name === "BLACK" || name === "WHITE" || name === "RED") {
      if (stage.bgs[stage.bgs.length - 1]?.name.toUpperCase() !== name) {
        stage.bgs.push({ name, img: this.special(name) });
      }
      return;
    }
    const img = await this.loadImage(name);
    if (slot === "bg") {
      if (stage.bgs[stage.bgs.length - 1]?.name.toUpperCase() === name) {
        stage.bgs[stage.bgs.length - 1] = { name, img };
      } else {
        stage.bgs.push({ name, img });
      }
      const { w, h } = this.sourceSize(img);
      if (w === STAGE_W && h === STAGE_H) {
        stage.l = null;
        stage.r = null;
        stage.c = null;
      }
    } else {
      stage[slot] = { name, img };
    }
  }

  draw(ctx: CanvasRenderingContext2D, drawOverlay: () => void): void {
    if (!this.frameCache || this.stageDirty) {
      this.frameCache = this.compose(this.stage);
      this.stageDirty = false;
    }
    this.clear(ctx);
    ctx.drawImage(this.frameCache, 0, 0, STAGE_W, STAGE_H);
    drawOverlay();
  }

  prefetch(commands: Command[], pc: number): void {
    const end = Math.min(commands.length, pc + 60);
    for (let i = pc; i < end; i++) {
      const command = commands[i];
      if (command?.cmd === "BMP" && command.args?.[0]) {
        void this.loadImage(command.args[0]);
        return;
      }
    }
  }

  private async transitionTo(
    next: Stage,
    kind: string,
    ctx: CanvasRenderingContext2D,
    drawOverlay: () => void,
  ): Promise<void> {
    if (this.stageEmpty(this.stage)) {
      this.stage = next;
      this.markDirty();
      this.draw(ctx, drawOverlay);
      return;
    }
    const from = this.compose(this.stage);
    const to = this.compose(next);
    return new Promise((resolve) => {
      let elapsed = 0;
      let last = performance.now();
      const frame = (now: number) => {
        if (!this.isPaused()) elapsed += now - last;
        last = now;
        const raw = Math.min(1, elapsed / TRANSITION_MS);
        const t = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
        this.drawTransition(ctx, from, to, kind, t);
        if (raw >= 1 || this.isStopped()) {
          this.stage = next;
          this.markDirty();
          this.draw(ctx, drawOverlay);
          resolve();
        } else {
          requestAnimationFrame(frame);
        }
      };
      requestAnimationFrame(frame);
    });
  }

  private drawTransition(
    ctx: CanvasRenderingContext2D,
    a: ImageSource,
    b: ImageSource,
    kind: string,
    t: number,
  ): void {
    this.clear(ctx);
    const paint = (img: ImageSource) => ctx.drawImage(img, 0, 0, STAGE_W, STAGE_H);
    switch (kind) {
      case "ワイプ":
        paint(a);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, STAGE_W * t, STAGE_H);
        ctx.clip();
        ctx.drawImage(b, 0, 0, STAGE_W, STAGE_H);
        ctx.restore();
        break;
      case "ワイプ２":
        paint(a);
        ctx.save();
        ctx.beginPath();
        ctx.rect(STAGE_W * (1 - t), 0, STAGE_W * t, STAGE_H);
        ctx.clip();
        ctx.drawImage(b, 0, 0, STAGE_W, STAGE_H);
        ctx.restore();
        break;
      case "上下":
        paint(a);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, STAGE_W, STAGE_H * t);
        ctx.clip();
        ctx.drawImage(b, 0, 0, STAGE_W, STAGE_H);
        ctx.restore();
        break;
      case "円１": {
        paint(a);
        const r = Math.hypot(STAGE_W, STAGE_H) * 0.5 * t;
        ctx.save();
        ctx.beginPath();
        ctx.arc(STAGE_W / 2, STAGE_H / 2, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(b, 0, 0, STAGE_W, STAGE_H);
        ctx.restore();
        break;
      }
      case "円２": {
        paint(b);
        const r = Math.hypot(STAGE_W, STAGE_H) * 0.5 * (1 - t);
        ctx.save();
        ctx.beginPath();
        ctx.arc(STAGE_W / 2, STAGE_H / 2, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(a, 0, 0, STAGE_W, STAGE_H);
        ctx.restore();
        break;
      }
      case "クロス":
      default:
        paint(a);
        ctx.globalAlpha = t;
        ctx.drawImage(b, 0, 0, STAGE_W, STAGE_H);
        ctx.globalAlpha = 1;
        break;
    }
  }

  private compose(stage: Stage): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = STAGE_W * RENDER_SCALE;
    c.height = STAGE_H * RENDER_SCALE;
    const g = c.getContext("2d");
    if (!g) return c;
    g.scale(RENDER_SCALE, RENDER_SCALE);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.fillStyle = "#000";
    g.fillRect(0, 0, STAGE_W, STAGE_H);

    for (const bg of stage.bgs) {
      const { w, h } = this.sourceSize(bg.img);
      const scale = this.hdScales.get(bg.name.toUpperCase()) ?? 1;
      const dw = Math.round(w / scale);
      const dh = Math.round(h / scale);
      if (dw === STAGE_W && dh === STAGE_H) g.drawImage(bg.img, 0, 0, STAGE_W, STAGE_H);
      else g.drawImage(bg.img, 0, 0, dw, dh);
    }

    for (const slot of ["l", "r", "c"] as const) {
      const layer = stage[slot];
      if (!layer) continue;
      const sprite = this.spriteCanvas(layer.name, layer.img);
      const source = this.sourceSize(sprite);
      const w = source.w / RENDER_SCALE;
      const h = source.h / RENDER_SCALE;
      const x = slot === "l" ? 0 : slot === "r" ? STAGE_W - w : Math.round((STAGE_W - w) / 2);
      g.drawImage(sprite, x, STAGE_H - h, w, h);
    }
    return c;
  }

  private loadImage(name: string): Promise<ImageSource> {
    const key = name.toUpperCase();
    if (key === "BLACK" || key === "WHITE" || key === "RED") {
      return Promise.resolve(this.special(key));
    }
    const cached = this.imageCache.get(key);
    if (cached) return Promise.resolve(cached);
    const inFlight = this.imagePromises.get(key);
    if (inFlight) return inFlight;

    const baseKey = name.toLowerCase();
    const hd4Rel = this.assets.hd4?.[baseKey];
    const hdRel = this.assets.hd?.[baseKey];
    const rel = hd4Rel ?? hdRel ?? this.assets.game?.[baseKey] ?? null;
    if (hd4Rel) this.hdScales.set(key, this.assets.hd4Scale ?? 4);
    else if (hdRel) this.hdScales.set(key, this.assets.hdScale ?? 2);
    if (!rel) {
      this.log(`missing image: ${name}`);
      return Promise.resolve(this.special("BLACK"));
    }
    const img = new Image();
    img.decoding = "async";
    const promise = new Promise<ImageSource>((resolve) => {
      img.onload = () => {
        this.imageCache.set(key, img);
        if (this.imageCache.size > IMAGE_CACHE_MAX) {
          const oldest = this.imageCache.keys().next().value;
          if (oldest !== undefined) this.imageCache.delete(oldest);
        }
        this.imagePromises.delete(key);
        resolve(img);
      };
      img.onerror = () => {
        this.imagePromises.delete(key);
        this.log(`failed to load image: ${name}`);
        resolve(this.special("BLACK"));
      };
    });
    img.src = `/media/${this.pack}/${rel}`;
    this.imagePromises.set(key, promise);
    return promise;
  }

  private spriteCanvas(name: string, img: ImageSource): HTMLCanvasElement {
    const key = name.toUpperCase();
    const cached = this.spriteCache.get(key);
    if (cached) return cached;
    const source = this.sourceSize(img);
    const scale = this.hdScales.get(key) ?? 1;
    const w = Math.round((source.w / scale) * RENDER_SCALE);
    const h = Math.round((source.h / scale) * RENDER_SCALE);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    if (g) {
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";
      g.drawImage(img, 0, 0, w, h);
      clearBlackBackground(g, w, h);
    }
    this.spriteCache.set(key, c);
    if (this.spriteCache.size > 12) {
      const oldest = this.spriteCache.keys().next().value;
      if (oldest !== undefined) this.spriteCache.delete(oldest);
    }
    return c;
  }

  private special(name: string): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = STAGE_W;
    c.height = STAGE_H;
    const g = c.getContext("2d");
    if (g) {
      g.fillStyle =
        name.toUpperCase() === "WHITE"
          ? "#fff"
          : name.toUpperCase() === "RED"
            ? "#b00016"
            : "#000";
      g.fillRect(0, 0, STAGE_W, STAGE_H);
    }
    return c;
  }

  private sourceSize(img: ImageSource): { w: number; h: number } {
    if (img instanceof HTMLCanvasElement) return { w: img.width, h: img.height };
    return { w: img.naturalWidth || STAGE_W, h: img.naturalHeight || STAGE_H };
  }

  private clear(ctx: CanvasRenderingContext2D): void {
    ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  }

  private stageEmpty(stage: Stage): boolean {
    return stage.bgs.length === 0 && !stage.l && !stage.r && !stage.c;
  }

  private markDirty(): void {
    this.stageDirty = true;
  }
}
