import type { AssetMap, Command, Option, Script } from "./types";

const W = 640;
const H = 480;
const IMAGE_CACHE_MAX = 8;
const TRANSITION_MS = 560;
const TEXT_CPS = 38; // characters per second

type ImageSource = HTMLImageElement | HTMLCanvasElement;

export interface PlayerEvents {
  status(text: string): void;
  log(text: string): void;
  loading(active: boolean): void;
  ended(): void;
  error(message: string): void;
  /** Current scene or command position changed. */
  position?(scene: string, pc: number): void;
  /** A menu is waiting for a selection, or null when it closes. */
  choice?(options: Option[] | null): void;
}

export interface Snapshot {
  version: 1;
  pack: string;
  scene: string;
  pc: number;
  image: string;
  thumbnail?: string;
  savedAt: number;
}

export class Player {
  private readonly ctx: CanvasRenderingContext2D;
  private commands: Command[];
  private labels: Record<string, number>;
  private readonly assets: AssetMap;
  private readonly events: PlayerEvents;
  private readonly pack: string;
  private scene: string;
  private readonly loadScript?: (name: string) => Promise<Script>;

  private pc = 0;
  private current: ImageSource | null = null;
  private currentImageName = "";
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

  // Dialogue state.
  private textSpeaker = "";
  private textPages: string[] = [];
  private textPage = 0;
  private textChars = 0;
  private textComplete = false;
  private textActive = false;
  private textResolve: (() => void) | null = null;
  private textRaf = 0;
  private textLast = 0;

  private choiceResolve: ((label: string) => void) | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    script: Script,
    assets: AssetMap,
    events: PlayerEvents,
    pack = "demo",
    scene = "",
    loadScript?: (name: string) => Promise<Script>,
  ) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("canvas 2d context unavailable");
    this.ctx = ctx;
    this.commands = script.commands;
    this.labels = script.labels;
    this.assets = assets;
    this.events = events;
    this.pack = pack;
    this.scene = scene.replace(/\.txt$/i, "").toLowerCase();
    this.loadScript = loadScript;
  }

  get currentScene(): string {
    return this.scene;
  }

  get currentPC(): number {
    // While a TEXT or menu command is waiting for input, point at that
    // command so a save/restored page replays the pending interaction.
    return this.textActive || this.choiceResolve ? Math.max(0, this.pc - 1) : this.pc;
  }

  snapshot(): Snapshot {
    return {
      version: 1,
      pack: this.pack,
      scene: this.scene,
      pc: this.currentPC,
      image: this.currentImageName,
      savedAt: Date.now(),
    };
  }

  choose(label: string): void {
    const resolve = this.choiceResolve;
    this.choiceResolve = null;
    this.events.choice?.(null);
    if (resolve) resolve(label);
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

  start(pc = 0, imageName = ""): void {
    this.pc = Math.max(0, pc);
    this.current = null;
    this.currentImageName = imageName;
    this.pending = null;
    this.running = true;
    this.paused = false;
    this.stopped = false;
    this.resetText();
    this.clear();
    this.events.status("playing");
    this.events.position?.(this.scene, this.currentPC);
    this.prefetchNext();
    if (imageName) {
      void this.loadImage(imageName).then((img) => {
        if (this.stopped) return;
        this.current = img;
        this.draw(img);
        void this.run();
      });
    } else {
      void this.run();
    }
  }

  stop(): void {
    this.stopped = true;
    this.running = false;
    this.resetText();
    const choiceResolve = this.choiceResolve;
    this.choiceResolve = null;
    this.events.choice?.(null);
    if (choiceResolve) choiceResolve("");
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

  /** True while dialogue is on screen and waiting for the player. */
  get hasText(): boolean {
    return this.textActive;
  }

  /**
   * Advance dialogue: finish the typewriter, show the next page, or dismiss
   * the message. Returns false when no text is active.
   */
  advance(): boolean {
    if (!this.textActive) return false;
    const page = this.textPages[this.textPage] ?? "";
    if (this.textChars < page.length) {
      this.textChars = page.length;
      this.textComplete = true;
      this.drawText();
      return true;
    }
    if (this.textPage + 1 < this.textPages.length) {
      this.textPage++;
      this.textChars = 0;
      this.textComplete = false;
      this.textLast = performance.now();
      this.drawText();
      this.scheduleTyping();
      return true;
    }
    this.finishText();
    return true;
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

  private draw(img: ImageSource | null = this.current): void {
    this.clear();
    if (img) this.ctx.drawImage(img, 0, 0, W, H);
    this.drawText();
  }

  private resetText(): void {
    if (this.textRaf) cancelAnimationFrame(this.textRaf);
    this.textRaf = 0;
    this.textActive = false;
    this.textComplete = false;
    this.textWaitersResolve();
  }

  private textWaitersResolve(): void {
    const resolve = this.textResolve;
    this.textResolve = null;
    if (resolve) resolve();
  }

  private showText(speaker: string, message: string): Promise<void> {
    const pages = message
      .split(/[￥¥]/)
      .map((page) => page.replace(/\r/g, "").trim())
      .filter((page) => page.length > 0);
    this.textSpeaker = speaker;
    this.textPages = pages.length > 0 ? pages : [""];
    this.textPage = 0;
    this.textChars = 0;
    this.textComplete = false;
    this.textActive = true;
    this.drawText();
    this.scheduleTyping();
    return new Promise((resolve) => {
      this.textResolve = resolve;
    });
  }

  private showChoice(options: Option[]): Promise<string> {
    if (options.length === 0) return Promise.resolve("");
    this.events.choice?.(options);
    return new Promise((resolve) => {
      this.choiceResolve = resolve;
    });
  }

  private scheduleTyping(): void {
    if (this.textRaf) cancelAnimationFrame(this.textRaf);
    this.textLast = performance.now();
    const tick = (now: number) => {
      if (!this.textActive) {
        this.textRaf = 0;
        return;
      }
      const page = this.textPages[this.textPage] ?? "";
      if (!this.paused) {
        const elapsed = now - this.textLast;
        this.textChars = Math.min(page.length, this.textChars + (elapsed * TEXT_CPS) / 1000);
      }
      this.textLast = now;
      if (this.textChars >= page.length) {
        this.textChars = page.length;
        this.textComplete = true;
        this.textRaf = 0;
        this.drawText();
        return;
      }
      this.drawText();
      this.textRaf = requestAnimationFrame(tick);
    };
    this.textRaf = requestAnimationFrame(tick);
  }

  private finishText(): void {
    if (this.textRaf) cancelAnimationFrame(this.textRaf);
    this.textRaf = 0;
    this.textActive = false;
    this.textComplete = false;
    this.textPages = [];
    this.textPage = 0;
    this.textChars = 0;
    this.draw();
    this.textWaitersResolve();
  }

  private drawText(): void {
    if (!this.textActive) return;
    const ctx = this.ctx;
    const page = this.textPages[this.textPage] ?? "";
    const visible = page.slice(0, Math.floor(this.textChars));

    const x = 18;
    const y = 326;
    const w = W - 36;
    const h = 142;
    ctx.save();
    ctx.fillStyle = "rgba(5, 6, 9, 0.82)";
    ctx.strokeStyle = "rgba(201, 168, 106, 0.72)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();

    // Speaker tab.
    if (this.textSpeaker) {
      ctx.font = '600 17px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
      const label = this.textSpeaker;
      const tw = Math.max(64, ctx.measureText(label).width + 28);
      ctx.fillStyle = "rgba(12, 12, 16, 0.95)";
      ctx.strokeStyle = "rgba(201, 168, 106, 0.55)";
      ctx.beginPath();
      ctx.roundRect(x + 12, y - 15, tw, 28, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(230, 196, 132, 0.95)";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + 26, y - 1);
    }

    // Body.
    ctx.font = '18px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(236, 232, 220, 0.96)";
    const maxWidth = w - 48;
    const lines: string[] = [];
    for (const para of visible.split("\n")) {
      let line = "";
      for (const ch of para) {
        const candidate = line + ch;
        if (ctx.measureText(candidate).width > maxWidth && line.length > 0) {
          lines.push(line);
          line = ch;
        } else {
          line = candidate;
        }
      }
      lines.push(line);
    }
    const visibleLines = lines.slice(0, 5);
    visibleLines.forEach((line, i) => {
      ctx.fillText(line, x + 24, y + 40 + i * 23);
    });

    if (this.textComplete) {
      const blink = Math.floor(performance.now() / 450) % 2 === 0;
      if (blink) {
        ctx.fillStyle = "rgba(201, 168, 106, 0.9)";
        ctx.beginPath();
        ctx.moveTo(x + w - 30, y + h - 22);
        ctx.lineTo(x + w - 20, y + h - 22);
        ctx.lineTo(x + w - 25, y + h - 15);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
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
    if (a.dataset.track !== rel) {
      a.src = this.audioURL(rel);
      a.dataset.track = rel;
      a.currentTime = 0;
    }
    a.volume = this.audioVolume();
    if (!this.paused) void a.play().catch(() => undefined);
  }

  private audioURL(rel: string): string {
    if (rel.toLowerCase().endsWith(".xa")) {
      return `/api/audio?pack=${encodeURIComponent(this.pack)}&file=${encodeURIComponent(rel)}`;
    }
    return `/media/${this.pack}/${rel}`;
  }

  private playSe(name: string | undefined): void {
    if (!name || name === "同") return;
    const rel = this.asset("se", name);
    if (!rel) {
      this.events.log(`missing se: ${name}`);
      return;
    }
    const a = new Audio(this.audioURL(rel));
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
          case "TEXT":
            this.events.position?.(this.scene, Math.max(0, this.pc - 1));
            await this.showText(c.speaker ?? "", c.message ?? "");
            break;
          case "BMP": {
            if (args.includes("消去") || (args[0] ?? "").toUpperCase() === "ALL") {
              this.currentImageName = "";
              this.pending = Promise.resolve(this.special("BLACK"));
              break;
            }
            const name = args.find((a) => !["L", "R", "C"].includes(a.toUpperCase())) ?? "BLACK";
            this.currentImageName = name;
            this.pending = this.loadImage(name);
            break;
          }
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
          case "STS":
            this.events.log(`title: ${args.join(" ")}`);
            break;
          case "LOD": {
            const name = (args[0] || "").replace(/\.txt$/i, "");
            if (!this.loadScript || !name) {
              this.events.log(`cannot load script: ${name || "(missing)"}`);
              this.stopped = true;
              break;
            }
            this.events.status(`loading ${name}`);
            try {
              const next = await this.loadScript(name);
              this.commands = next.commands;
              this.labels = next.labels;
              this.scene = name.toLowerCase();
              this.pc = 0;
              this.events.status("playing");
              this.events.position?.(this.scene, 0);
              this.prefetchNext();
            } catch (err) {
              this.events.log(`failed to load ${name}: ${String(err)}`);
              this.stopped = true;
            }
            break;
          }
          case "SLT":
          case "MSLT": {
            const label = await this.showChoice(c.options ?? []);
            if (label && label in this.labels) {
              this.pc = this.labels[label];
              this.events.position?.(this.scene, this.pc);
            } else {
              this.events.log(`unknown choice label: ${label}`);
              this.stopped = true;
            }
            break;
          }
          case "SEND":
          case "SHAEND":
            // The engine treats this as the end of the current scene. Until
            // map/scene management exists, stop instead of falling through
            // into the script's branch labels.
            this.stopped = true;
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
            // Commands used by the full game (MAP/LOD/EVT/...) are ignored by
            // the current runtime. They are tracked in docs/engine/script.md.
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
    this.choiceResolve = null;
    this.events.choice?.(null);
    this.events.loading(false);
    this.events.status("ended");
    this.events.ended();
  }
}
