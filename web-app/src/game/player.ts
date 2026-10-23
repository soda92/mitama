import type { AssetMap, Command, Script } from "./types";

const W = 640;
const H = 480;
const IMAGE_CACHE_MAX = 8;
const TRANSITION_MS = 560;

type ImageSource = HTMLImageElement | HTMLCanvasElement;

export interface PlayerEvents {
  status(text: string): void;
  log(text: string): void;
  loading(active: boolean): void;
  ended(): void;
  error(message: string): void;
}

export class Player {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly commands: Command[];
  private readonly labels: Record<string, number>;
  private readonly assets: AssetMap;
  private readonly events: PlayerEvents;
  private readonly pack: string;

  private pc = 0;
  private current: ImageSource | null = null;
  private pending: Promise<ImageSource> | null = null;
  private running = false;
  private paused = false;
  private stopped = true;
  private volume = 0.7;
  private muted = false;

  private readonly imageCache = new Map<string, ImageSource>();
  private readonly imagePromises = new Map<string, Promise<ImageSource>>();
  private bgm: HTMLAudioElement | null = null;
  private readonly liveSe = new Set<HTMLAudioElement>();

  constructor(
    canvas: HTMLCanvasElement,
    script: Script,
    assets: AssetMap,
    events: PlayerEvents,
    pack = "demo",
  ) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("canvas 2d context unavailable");
    this.ctx = ctx;
    this.commands = script.commands;
    this.labels = script.labels;
    this.assets = assets;
    this.events = events;
    this.pack = pack;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get isRunning(): boolean {
    return this.running;
  }

  async primeAudio(): Promise<void> {
    const a = this.ensureBgm();
    try {
      a.volume = 0;
      await a.play();
      a.pause();
      a.currentTime = 0;
      a.volume = this.audioVolume();
    } catch {
      // Autoplay may still be blocked; BGM will start on the next attempt.
    }
  }

  start(): void {
    this.pc = 0;
    this.current = null;
    this.pending = null;
    this.running = true;
    this.paused = false;
    this.stopped = false;
    this.clear();
    this.events.status("playing");
    this.prefetchNext();
    void this.run();
  }

  stop(): void {
    this.stopped = true;
    this.running = false;
    if (this.bgm) this.bgm.pause();
    for (const a of this.liveSe) a.pause();
    this.liveSe.clear();
  }

  setPaused(paused: boolean): void {
    if (!this.running || this.stopped) return;
    this.paused = paused;
    this.events.status(paused ? "paused" : "playing");
    if (this.bgm) {
      if (paused) this.bgm.pause();
      else void this.bgm.play().catch(() => undefined);
    }
    for (const a of this.liveSe) {
      if (paused) a.pause();
      else void a.play().catch(() => undefined);
    }
  }

  togglePaused(): boolean {
    this.setPaused(!this.paused);
    return this.paused;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.bgm) this.bgm.volume = this.audioVolume();
    for (const a of this.liveSe) a.volume = this.audioVolume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.bgm) this.bgm.volume = this.audioVolume();
    for (const a of this.liveSe) a.volume = this.audioVolume();
  }

  private audioVolume(): number {
    return this.muted ? 0 : this.volume;
  }

  private clear(): void {
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, W, H);
  }

  private asset(kind: keyof AssetMap, name: string | undefined): string | null {
    if (!name) return null;
    return this.assets[kind]?.[name.toLowerCase()] ?? null;
  }

  private special(name: string): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    if (g) {
      g.fillStyle = name.toUpperCase() === "WHITE" ? "#fff" : "#000";
      g.fillRect(0, 0, W, H);
    }
    return c;
  }

  private loadImage(name: string): Promise<ImageSource> {
    const key = name.toUpperCase();
    if (key === "BLACK" || key === "WHITE") return Promise.resolve(this.special(key));
    const cached = this.imageCache.get(key);
    if (cached) return Promise.resolve(cached);
    const inFlight = this.imagePromises.get(key);
    if (inFlight) return inFlight;

    const rel = this.asset("game", name);
    if (!rel) {
      this.events.log(`missing image: ${name}`);
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
        this.events.log(`failed to load image: ${name}`);
        resolve(this.special("BLACK"));
      };
    });
    img.src = `/media/${this.pack}/${rel}`;
    this.imagePromises.set(key, promise);
    return promise;
  }

  private draw(img: ImageSource | null): void {
    this.clear();
    if (img) this.ctx.drawImage(img, 0, 0, W, H);
  }

  private drawTransition(a: ImageSource, b: ImageSource, kind: string, t: number): void {
    const ctx = this.ctx;
    this.clear();
    switch (kind) {
      case "ワイプ":
        this.draw(a);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W * t, H);
        ctx.clip();
        ctx.drawImage(b, 0, 0, W, H);
        ctx.restore();
        break;
      case "ワイプ２":
        this.draw(a);
        ctx.save();
        ctx.beginPath();
        ctx.rect(W * (1 - t), 0, W * t, H);
        ctx.clip();
        ctx.drawImage(b, 0, 0, W, H);
        ctx.restore();
        break;
      case "上下":
        this.draw(a);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W, H * t);
        ctx.clip();
        ctx.drawImage(b, 0, 0, W, H);
        ctx.restore();
        break;
      case "円１": {
        this.draw(a);
        const r = Math.hypot(W, H) * 0.5 * t;
        ctx.save();
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(b, 0, 0, W, H);
        ctx.restore();
        break;
      }
      case "円２": {
        this.draw(b);
        const r = Math.hypot(W, H) * 0.5 * (1 - t);
        ctx.save();
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(a, 0, 0, W, H);
        ctx.restore();
        break;
      }
      case "クロス":
      default:
        this.draw(a);
        ctx.globalAlpha = t;
        ctx.drawImage(b, 0, 0, W, H);
        ctx.globalAlpha = 1;
        break;
    }
  }

  private transition(next: ImageSource, kind: string): Promise<void> {
    if (!this.current) {
      this.current = next;
      this.draw(next);
      return Promise.resolve();
    }
    const from = this.current;
    return new Promise((resolve) => {
      let elapsed = 0;
      let last = performance.now();
      const frame = (now: number) => {
        if (!this.paused) elapsed += now - last;
        last = now;
        const raw = Math.min(1, elapsed / TRANSITION_MS);
        const t = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
        this.drawTransition(from, next, kind, t);
        if (raw >= 1 || this.stopped) {
          this.current = next;
          this.draw(next);
          resolve();
        } else {
          requestAnimationFrame(frame);
        }
      };
      requestAnimationFrame(frame);
    });
  }

  private sleep(ms: number): Promise<void> {
    if (!(ms > 0)) return Promise.resolve();
    return new Promise((resolve) => {
      let left = ms;
      let last = performance.now();
      const tick = (now: number) => {
        if (!this.paused) left -= now - last;
        last = now;
        if (left <= 0 || this.stopped) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  private prefetchNext(): void {
    const end = Math.min(this.commands.length, this.pc + 60);
    for (let i = this.pc; i < end; i++) {
      const c = this.commands[i];
      if (c?.cmd === "BMP" && c.args?.[0]) {
        void this.loadImage(c.args[0]);
        return;
      }
    }
  }

  private ensureBgm(): HTMLAudioElement {
    if (!this.bgm) {
      this.bgm = new Audio();
      this.bgm.loop = true;
      this.bgm.preload = "auto";
      this.bgm.volume = this.audioVolume();
    }
    return this.bgm;
  }

  private playBgm(name: string | undefined): void {
    if (!name) return;
    if (name.toUpperCase() === "STOP") {
      if (this.bgm) {
        this.bgm.pause();
        this.bgm.currentTime = 0;
      }
      return;
    }
    const rel = this.asset("bgm", name);
    if (!rel) {
      this.events.log(`missing bgm: ${name}`);
      return;
    }
    const a = this.ensureBgm();
    if (!a.src.endsWith(rel)) {
      a.src = `/media/${this.pack}/${rel}`;
      a.currentTime = 0;
    }
    a.volume = this.audioVolume();
    if (!this.paused) void a.play().catch(() => undefined);
  }

  private playSe(name: string | undefined): void {
    if (!name || name === "同") return;
    const rel = this.asset("se", name);
    if (!rel) {
      this.events.log(`missing se: ${name}`);
      return;
    }
    const a = new Audio(`/media/${this.pack}/${rel}`);
    a.volume = this.audioVolume();
    this.liveSe.add(a);
    const done = () => this.liveSe.delete(a);
    a.addEventListener("ended", done, { once: true });
    a.addEventListener("error", done, { once: true });
    void a.play().catch(done);
  }

  private async run(): Promise<void> {
    try {
      while (!this.stopped) {
        if (this.pc >= this.commands.length) break;
        const c = this.commands[this.pc++];
        if (c.label) {
          this.events.log(`label ${c.label}`);
          continue;
        }
        const args = c.args ?? [];
        this.events.log(`L${c.line}  ${c.cmd}${args.length ? " " + args.join(" ") : ""}`);
        switch (c.cmd) {
          case "BMP":
            this.pending = this.loadImage(args[0] || "BLACK");
            break;
          case "UPD": {
            const kind = args[0] || "クロス";
            if (this.pending) {
              this.events.loading(true);
              const img = await this.pending;
              this.events.loading(false);
              this.pending = null;
              await this.transition(img, kind);
              this.prefetchNext();
            }
            break;
          }
          case "WAIT": {
            const ms = Number.parseInt(args[0] || "0", 10);
            await this.sleep(Number.isFinite(ms) ? Math.min(ms, 60000) : 0);
            break;
          }
          case "MUS":
            this.playBgm(args[0]);
            break;
          case "SEV":
            this.playSe(args[0]);
            break;
          case "JMP": {
            const dest = args[0];
            if (dest && dest in this.labels) this.pc = this.labels[dest];
            else {
              this.events.log(`unknown label: ${dest}`);
              this.stopped = true;
            }
            break;
          }
          case "END":
            this.stopped = true;
            break;
          default:
            break;
        }
      }
      if (this.running) this.finish();
    } catch (err) {
      this.events.error(err instanceof Error ? err.message : String(err));
      this.finish();
    }
  }

  private finish(): void {
    this.running = false;
    this.stopped = true;
    this.events.loading(false);
    this.events.status("ended");
    this.events.ended();
  }
}
