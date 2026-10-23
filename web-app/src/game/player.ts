import type { AssetMap, Command, Cue, Option, Script } from "./types";

const W = 640;
const H = 480;
const IMAGE_CACHE_MAX = 8;
const TRANSITION_MS = 560;
const TEXT_CPS = 38; // characters per second
const RENDER_SCALE = 3;

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

export interface StageSnapshot {
  bg?: string;
  bgs?: string[];
  l?: string;
  r?: string;
  c?: string;
}

export interface Snapshot {
  version: 1;
  pack: string;
  scene: string;
  pc: number;
  image: string;
  stage?: StageSnapshot;
  flags?: Record<string, number>;
  thumbnail?: string;
  savedAt: number;
}

export interface AudioDebug {
  bgm: {
    src: string;
    track: string;
    paused: boolean;
    volume: number;
    muted: boolean;
    currentTime: number;
    duration: number;
  } | null;
  lastSe: string;
  lastSeAt: number;
  liveSe: number;
}

export interface DebugState {
  pack: string;
  scene: string;
  pc: number;
  currentPC: number;
  running: boolean;
  paused: boolean;
  command: { line: number; cmd?: string; args?: string[]; label?: string } | null;
  text: {
    active: boolean;
    speaker: string;
    page: number;
    pages: number;
    chars: number;
    length: number;
    complete: boolean;
  };
  choice: Option[] | null;
  dialogueHidden: boolean;
  dialogueOpacity: number;
  flags: Record<string, number>;
  stage: StageSnapshot;
  audio: AudioDebug;
}

interface StageImage {
  name: string;
  img: ImageSource;
}

interface Stage {
  bgs: StageImage[];
  l: StageImage | null;
  r: StageImage | null;
  c: StageImage | null;
}

type Slot = "l" | "r" | "c";
type BmpSlot = Slot | "bg";

function emptyStage(): Stage {
  return { bgs: [], l: null, r: null, c: null };
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
  private stage: Stage = emptyStage();
  private pendingStage: Stage | null = null;
  private pendingLoads: Promise<void>[] = [];
  private frameCache: HTMLCanvasElement | null = null;
  private stageDirty = true;
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
  private textCues: Cue[] = [];
  private textPage = 0;
  private textChars = 0;
  private textComplete = false;
  private textActive = false;
  private textResolve: (() => void) | null = null;
  private textRaf = 0;
  private textLast = 0;
  private dialogueHidden = false;
  private dialogueOpacity = 1;

  private choiceResolve: ((label: string) => void) | null = null;
  private pendingChoice: Option[] | null = null;
  private flags = new Map<number, number>();
  private lastSeName = "";
  private lastSeAt = 0;

  constructor(
    canvas: HTMLCanvasElement,
    script: Script,
    assets: AssetMap,
    events: PlayerEvents,
    pack = "demo",
    scene = "",
    loadScript?: (name: string) => Promise<Script>,
  ) {
    // Render the 640x480 stage at 2x internally and let CSS scale it down.
    // This keeps the bitmap art unchanged but makes dialogue text crisp.
    canvas.width = W * RENDER_SCALE;
    canvas.height = H * RENDER_SCALE;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("canvas 2d context unavailable");
    ctx.scale(RENDER_SCALE, RENDER_SCALE);
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
    const stage = this.stageSnapshot();
    return {
      version: 1,
      pack: this.pack,
      scene: this.scene,
      pc: this.currentPC,
      image: stage.bg ?? "",
      stage,
      flags: Object.fromEntries(this.flags),
      savedAt: Date.now(),
    };
  }

  get flagState(): Record<string, number> {
    return Object.fromEntries(this.flags);
  }

  choose(label: string): void {
    const resolve = this.choiceResolve;
    this.choiceResolve = null;
    this.pendingChoice = null;
    this.events.choice?.(null);
    if (resolve) resolve(label);
  }

  private flagID(arg: string | undefined): number {
    const n = Number.parseInt(arg ?? "0", 10);
    return Number.isFinite(n) ? n : 0;
  }

  private getFlag(arg: string | undefined): number {
    return this.flags.get(this.flagID(arg)) ?? 0;
  }

  private setFlag(arg: string | undefined, value: number): void {
    this.flags.set(this.flagID(arg), value);
  }

  private jumpTo(label: string | undefined): void {
    if (label && label in this.labels) {
      this.pc = this.labels[label];
      this.events.position?.(this.scene, this.pc);
    } else {
      this.events.log(`unknown label: ${label}`);
      this.stopped = true;
    }
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

  debugState(): DebugState {
    const cmd = this.pc > 0 ? this.commands[this.pc - 1] : null;
    return {
      pack: this.pack,
      scene: this.scene,
      pc: this.pc,
      currentPC: this.currentPC,
      running: this.running,
      paused: this.paused,
      command: cmd
        ? { line: cmd.line, cmd: cmd.cmd, args: cmd.args, label: cmd.label }
        : null,
      text: {
        active: this.textActive,
        speaker: this.textSpeaker,
        page: this.textPage + 1,
        pages: this.textPages.length,
        chars: Math.floor(this.textChars),
        length: this.textPages[this.textPage]?.length ?? 0,
        complete: this.textComplete,
      },
      choice: this.pendingChoice,
      dialogueHidden: this.dialogueHidden,
      dialogueOpacity: this.dialogueOpacity,
      flags: Object.fromEntries(this.flags),
      stage: this.stageSnapshot(),
      audio: this.audioState(),
    };
  }

  audioState(): AudioDebug {
    const bgm = this.bgm;
    return {
      bgm: bgm
        ? {
            src: bgm.src ? decodeURIComponent(bgm.src) : "",
            track: bgm.dataset.track ?? "",
            paused: bgm.paused,
            volume: bgm.volume,
            muted: this.muted,
            currentTime: Number.isFinite(bgm.currentTime) ? bgm.currentTime : 0,
            duration: Number.isFinite(bgm.duration) ? bgm.duration : 0,
          }
        : null,
      lastSe: this.lastSeName,
      lastSeAt: this.lastSeAt,
      liveSe: this.liveSe.size,
    };
  }

  stageSnapshot(): StageSnapshot {
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

  setDebugFlag(id: number, value: number): void {
    this.flags.set(id, value);
  }

  setDialogueHidden(hidden: boolean): void {
    if (this.dialogueHidden === hidden) return;
    this.dialogueHidden = hidden;
    this.draw();
  }

  setDialogueOpacity(opacity: number): void {
    const value = Math.max(0, Math.min(1, opacity));
    if (this.dialogueOpacity === value) return;
    this.dialogueOpacity = value;
    this.draw();
  }

  unlockAudio(): void {
    void this.primeAudio();
    if (this.bgm?.dataset.track && this.bgm.paused) {
      void this.bgm.play().catch(() => undefined);
    }
  }

  private readonly redraw = (): void => {
    if (!this.stopped) this.draw();
  };

  start(
    pc = 0,
    imageName = "",
    flags?: Record<string, number>,
    stageSnapshot?: StageSnapshot,
  ): void {
    this.pc = this.rewindForVoice(Math.max(0, pc));
    this.stage = emptyStage();
    this.pendingStage = null;
    this.pendingLoads = [];
    this.running = true;
    this.paused = false;
    this.stopped = false;
    this.dialogueHidden = false;
    this.flags = new Map(
      Object.entries(flags ?? {}).map(([k, v]) => [Number.parseInt(k, 10), v]),
    );
    this.resetText();
    this.clear();
    this.events.status("playing");
    this.events.position?.(this.scene, this.currentPC);
    window.addEventListener("resize", this.redraw);
    document.addEventListener("fullscreenchange", this.redraw);
    this.prefetchNext();

    const restore = async () => {
      const snap = stageSnapshot;
      if (snap) {
        const bgs = snap.bgs && snap.bgs.length > 0 ? snap.bgs : snap.bg ? [snap.bg] : [];
        await this.restoreBackgrounds(bgs);
        await Promise.all([
          this.restoreSlot("l", snap.l),
          this.restoreSlot("r", snap.r),
          this.restoreSlot("c", snap.c),
        ]);
      } else if (this.pc > 0) {
        this.events.loading(true);
        await this.restoreBefore(this.pc);
        this.events.loading(false);
      } else if (imageName) {
        await this.restoreBackgrounds([imageName]);
      }
    };
    void restore().then(() => {
      if (this.stopped) return;
      this.draw();
      void this.run();
    });
  }

  /** Include the SEV immediately before a TEXT so a resumed line has voice. */
  private rewindForVoice(pc: number): number {
    if (this.commands[pc]?.cmd !== "TEXT") return pc;
    let q = pc;
    while (q > 0 && this.commands[q - 1].cmd === "SEV") q--;
    return q;
  }

  private async applyBmp(stage: Stage, args: string[]): Promise<void> {
    const name = (args.find((a) => !["L", "R", "C", "消去"].includes(a.toUpperCase())) ?? "BLACK").toUpperCase();
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
        // Remove the matching background layer (e.g. BLACK 消去 reveals the
        // background underneath it) rather than clearing the whole stage.
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
      if (w === W && h === H) {
        stage.l = null;
        stage.r = null;
        stage.c = null;
      }
    } else {
      stage[slot] = { name, img };
    }
  }

  /** Rebuild stage, flags and BGM by replaying commands before a scene link. */
  private async restoreBefore(pc: number): Promise<void> {
    const stage = emptyStage();
    let music = "";
    for (let i = 0; i < pc && i < this.commands.length; i++) {
      const c = this.commands[i];
      const args = c.args ?? [];
      switch (c.cmd) {
        case "BMP":
          if (c.args) await this.applyBmp(stage, c.args);
          break;
        case "MUS":
          music = args[0] ?? "";
          break;
        case "FLG": {
          const value = (args[1] ?? "").toUpperCase();
          this.setFlag(args[0], value === "ON" ? 1 : value === "OFF" ? 0 : this.flagID(args[1]));
          break;
        }
        case "EQU":
          this.setFlag(args[0], this.flagID(args[1] === "=" ? args[2] : args[1]));
          break;
        case "INC":
          this.setFlag(args[0], this.getFlag(args[0]) + (args[1] ? this.flagID(args[1]) : 1));
          break;
        case "DEC":
          this.setFlag(args[0], this.getFlag(args[0]) - (args[1] ? this.flagID(args[1]) : 1));
          break;
        default:
          break;
      }
    }
    this.stage = stage;
    this.markStageDirty();
    if (music && music.toUpperCase() !== "STOP") this.playBgm(music);
  }

  private async restoreBackgrounds(names: string[]): Promise<void> {
    this.stage.bgs = [];
    this.markStageDirty();
    for (const name of names) {
      const img = await this.loadImage(name);
      this.stage.bgs.push({ name, img });
    }
  }

  private async restoreSlot(slot: Slot, name?: string): Promise<void> {
    if (!name) return;
    const img = await this.loadImage(name);
    this.stage[slot] = { name, img };
    this.markStageDirty();
  }

  stop(): void {
    this.stopped = true;
    this.running = false;
    this.resetText();
    window.removeEventListener("resize", this.redraw);
    document.removeEventListener("fullscreenchange", this.redraw);
    const choiceResolve = this.choiceResolve;
    this.choiceResolve = null;
    this.pendingChoice = null;
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
      this.draw();
      return true;
    }
    if (this.textPage + 1 < this.textPages.length) {
      this.textPage++;
      this.textChars = 0;
      this.textComplete = false;
      this.textLast = performance.now();
      this.playCues(this.textPage);
      this.draw();
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
    // A transition or canvas operation must never leave a scale/alpha behind.
    this.ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    this.ctx.globalAlpha = 1;
    this.ctx.globalCompositeOperation = "source-over";
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
      g.fillStyle =
        name.toUpperCase() === "WHITE" ? "#fff" : name.toUpperCase() === "RED" ? "#b00016" : "#000";
      g.fillRect(0, 0, W, H);
    }
    return c;
  }

  private loadImage(name: string): Promise<ImageSource> {
    const key = name.toUpperCase();
    if (key === "BLACK" || key === "WHITE" || key === "RED")
      return Promise.resolve(this.special(key));
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

  private sourceSize(img: ImageSource): { w: number; h: number } {
    if (img instanceof HTMLCanvasElement) return { w: img.width, h: img.height };
    return { w: img.naturalWidth || W, h: img.naturalHeight || H };
  }

  private readonly spriteCache = new Map<string, HTMLCanvasElement>();

  private spriteCanvas(name: string, img: ImageSource): HTMLCanvasElement {
    const key = name.toUpperCase();
    const cached = this.spriteCache.get(key);
    if (cached) return cached;
    const { w, h } = this.sourceSize(img);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    if (g) {
      g.drawImage(img, 0, 0, w, h);
      const pixels = g.getImageData(0, 0, w, h);
      const d = pixels.data;
      for (let i = 0; i < d.length; i += 4) {
        // Character stands are stored on a pure-black key background.
        if (d[i] === 0 && d[i + 1] === 0 && d[i + 2] === 0) d[i + 3] = 0;
      }
      g.putImageData(pixels, 0, 0);
    }
    this.spriteCache.set(key, c);
    if (this.spriteCache.size > 12) {
      const oldest = this.spriteCache.keys().next().value;
      if (oldest !== undefined) this.spriteCache.delete(oldest);
    }
    return c;
  }

  private composeStage(stage: Stage): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    if (!g) return c;
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, H);

    for (const bg of stage.bgs) {
      const { w, h } = this.sourceSize(bg.img);
      if (w === W && h === H) g.drawImage(bg.img, 0, 0, W, H);
      else g.drawImage(bg.img, 0, 0, w, h);
    }

    for (const slot of ["l", "r", "c"] as const) {
      const layer = stage[slot];
      if (!layer) continue;
      const sprite = this.spriteCanvas(layer.name, layer.img);
      const { w, h } = this.sourceSize(sprite);
      const x = slot === "l" ? 0 : slot === "r" ? W - w : Math.round((W - w) / 2);
      g.drawImage(sprite, x, H - h, w, h);
    }
    return c;
  }

  private markStageDirty(): void {
    this.stageDirty = true;
  }

  private draw(): void {
    if (!this.frameCache || this.stageDirty) {
      this.frameCache = this.composeStage(this.stage);
      this.stageDirty = false;
    }
    this.clear();
    this.ctx.drawImage(this.frameCache, 0, 0, W, H);
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

  private showText(speaker: string, message: string, cues: Cue[] = []): Promise<void> {
    const pages = message
      .split(/[￥¥]/)
      .map((page) => page.replace(/\r/g, "").trim())
      .filter((page) => page.length > 0);
    this.textSpeaker = speaker;
    this.textCues = cues;
    this.textPages = pages.length > 0 ? pages : [""];
    this.textPage = 0;
    this.textChars = 0;
    this.textComplete = false;
    this.textActive = true;
    this.draw();
    this.scheduleTyping();
    this.playCues(0);
    return new Promise((resolve) => {
      this.textResolve = resolve;
    });
  }

  private playCues(page: number): void {
    for (const cue of this.textCues) {
      if (cue.page === page) this.playSe(cue.name);
    }
  }

  private showChoice(options: Option[]): Promise<string> {
    if (options.length === 0) return Promise.resolve("");
    this.pendingChoice = options;
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
        this.draw();
        return;
      }
      this.draw();
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
    this.textCues = [];
    this.textPage = 0;
    this.textChars = 0;
    this.draw();
    this.textWaitersResolve();
  }

  private drawText(): void {
    if (!this.textActive || this.dialogueHidden) return;
    const ctx = this.ctx;
    const page = this.textPages[this.textPage] ?? "";
    const visible = page.slice(0, Math.floor(this.textChars));

    const x = 18;
    const y = 326;
    const w = W - 36;
    const h = 142;
    ctx.save();
    ctx.fillStyle = `rgba(7, 8, 12, ${this.dialogueOpacity})`;
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
      ctx.fillStyle = `rgba(12, 12, 16, ${this.dialogueOpacity})`;
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

  private paint(img: ImageSource): void {
    this.ctx.drawImage(img, 0, 0, W, H);
  }

  private drawTransition(a: ImageSource, b: ImageSource, kind: string, t: number): void {
    const ctx = this.ctx;
    this.clear();
    switch (kind) {
      case "ワイプ":
        this.paint(a);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W * t, H);
        ctx.clip();
        ctx.drawImage(b, 0, 0, W, H);
        ctx.restore();
        break;
      case "ワイプ２":
        this.paint(a);
        ctx.save();
        ctx.beginPath();
        ctx.rect(W * (1 - t), 0, W * t, H);
        ctx.clip();
        ctx.drawImage(b, 0, 0, W, H);
        ctx.restore();
        break;
      case "上下":
        this.paint(a);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W, H * t);
        ctx.clip();
        ctx.drawImage(b, 0, 0, W, H);
        ctx.restore();
        break;
      case "円１": {
        this.paint(a);
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
        this.paint(b);
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
        this.paint(a);
        ctx.globalAlpha = t;
        ctx.drawImage(b, 0, 0, W, H);
        ctx.globalAlpha = 1;
        break;
    }
  }

  private stageEmpty(stage: Stage): boolean {
    return stage.bgs.length === 0 && !stage.l && !stage.r && !stage.c;
  }

  private transitionTo(nextStage: Stage, kind: string): Promise<void> {
    if (this.stageEmpty(this.stage)) {
      this.stage = nextStage;
      this.markStageDirty();
      this.draw();
      return Promise.resolve();
    }
    const from = this.composeStage(this.stage);
    const to = this.composeStage(nextStage);
    return new Promise((resolve) => {
      let elapsed = 0;
      let last = performance.now();
      const frame = (now: number) => {
        if (!this.paused) elapsed += now - last;
        last = now;
        const raw = Math.min(1, elapsed / TRANSITION_MS);
        const t = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
        this.drawTransition(from, to, kind, t);
        if (raw >= 1 || this.stopped) {
          this.stage = nextStage;
          this.markStageDirty();
          this.draw();
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
    this.lastSeName = name;
    this.lastSeAt = Date.now();
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
            await this.showText(c.speaker ?? "", c.message ?? "", c.cues ?? []);
            break;
          case "BMP": {
            this.pendingStage ??= { ...this.stage };
            const stage = this.pendingStage;
            this.pendingLoads.push(this.applyBmp(stage, args));
            break;
          }
          case "UPD": {
            const kind = args[0] || "クロス";
            if (this.pendingStage) {
              this.events.loading(true);
              await Promise.all(this.pendingLoads);
              this.pendingLoads = [];
              this.events.loading(false);
              const next = this.pendingStage;
              this.pendingStage = null;
              await this.transitionTo(next, kind);
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
          case "FLG": {
            const id = args[0];
            const value = (args[1] ?? "").toUpperCase();
            this.setFlag(id, value === "ON" ? 1 : value === "OFF" ? 0 : this.flagID(args[1]));
            break;
          }
          case "EQU": {
            // EQU dest value / EQU dest = value. The scripts use small state
            // values (01, 02, ...), so a numeric RHS is the practical reading.
            const valueArg = args[1] === "=" ? args[2] : args[1];
            this.setFlag(args[0], this.flagID(valueArg));
            break;
          }
          case "INC":
            this.setFlag(args[0], this.getFlag(args[0]) + (args[1] ? this.flagID(args[1]) : 1));
            break;
          case "DEC":
            this.setFlag(args[0], this.getFlag(args[0]) - (args[1] ? this.flagID(args[1]) : 1));
            break;
          case "RND": {
            const max = Math.max(1, this.flagID(args[1]));
            this.setFlag(args[0], Math.floor(Math.random() * max));
            break;
          }
          case "FCK": {
            // FCK flag label
            // FCK a & b & c label
            // FCK flag ON|OFF label
            const label = args[args.length - 1];
            let yes = false;
            if (args.length === 2) {
              yes = this.getFlag(args[0]) !== 0;
            } else if (args.includes("&")) {
              yes = args
                .slice(0, -1)
                .filter((a) => a !== "&")
                .every((a) => this.getFlag(a) !== 0);
            } else {
              const mode = (args[2] ?? "").toUpperCase();
              yes =
                mode === "ON"
                  ? this.getFlag(args[0]) !== 0
                  : mode === "OFF"
                    ? this.getFlag(args[0]) === 0
                    : this.getFlag(args[0]) !== 0;
            }
            if (yes) this.jumpTo(label);
            break;
          }
          case "IFT": {
            const left = this.getFlag(args[0]);
            let op = "=";
            let right: number;
            let label: string | undefined;
            if (args.length >= 4) {
              op = args[1] ?? "=";
              right = this.flagID(args[2]);
              label = args[3];
            } else {
              right = this.flagID(args[1]);
              label = args[2];
            }
            const yes =
              op === ">" ? left > right : op === "<" ? left < right : left === right;
            if (yes) this.jumpTo(label);
            break;
          }
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
    this.pendingChoice = null;
    this.events.choice?.(null);
    this.events.loading(false);
    this.events.status("ended");
    this.events.ended();
  }
}
