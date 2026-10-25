import { protagonistOfScene, speakerDisplayName, speakerEnglishName } from "./types";
import type {
  AssetMap,
  Command,
  Cue,
  DialogueOverlayState,
  Option,
  Protagonist,
  Script,
} from "./types";
import { AudioEngine, type AudioSnapshot } from "./player/audio";
import {
  STAGE_H as H,
  STAGE_W as W,
  RENDER_SCALE,
  TEXT_CPS,
} from "./player/constants";
import {
  StageRenderer,
  emptyStage,
  type StageSnapshot,
} from "./player/stage";

export type { StageSnapshot } from "./player/stage";

function splitPages(message: string): string[] {
  return message
    .split(/[￥¥]/)
    .map((page) => page.replace(/\r/g, "").trim())
    .filter((page) => page.length > 0);
}

function typewriterBoundaries(text: string): number[] {
  const boundaries: number[] = [];
  const token = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[A-Za-z0-9'’_-]+|\s+|./gu;
  let match: RegExpExecArray | null;
  while ((match = token.exec(text)) !== null) {
    boundaries.push(match.index + match[0].length);
  }
  return boundaries;
}

function nextTypewriterBoundary(text: string, from: number): number {
  for (const boundary of typewriterBoundaries(text)) {
    if (boundary > from) return boundary;
  }
  return text.length;
}

export interface BattleInfo {
  background: string;
  script: string;
  party: string[];
}

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
  /** A background/music asset was requested by the script. */
  asset?(kind: "image" | "music", name: string): void;
  /** Current dialogue overlay state, or null when it is hidden. */
  dialogue?(state: DialogueOverlayState | null): void;
  /** The script requested a return to the title screen. */
  title?(): void;
  /** Run a battle and return the result. */
  battle?(info: BattleInfo): "win" | "lose" | void | Promise<"win" | "lose" | void>;
}

export interface Snapshot {
  version: 1;
  pack: string;
  scene: string;
  pc: number;
  image: string;
  stage?: StageSnapshot;
  flags?: Record<string, number>;
  party?: string[];
  mapMode?: boolean;
  protagonist?: Protagonist;
  speaker?: string;
  dialogue?: string;
  note?: string;
  pinned?: boolean;
  thumbnail?: string;
  savedAt: number;
}

export type AudioDebug = AudioSnapshot;

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
  mapMode: boolean;
  party: string[];
  stage: StageSnapshot;
  audio: AudioDebug;
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
  private running = false;
  private paused = false;
  private stopped = true;
  private readonly audio: AudioEngine;
  private readonly stageRenderer: StageRenderer;

  // Dialogue state.
  private textSpeaker = "";
  private textSpeakerEN = "";
  private textPages: string[] = [];
  private textPagesEN: string[] = [];
  private textCues: Cue[] = [];
  private textPage = 0;
  private textChars = 0;
  private textComplete = false;
  private textActive = false;
  private textResolve: (() => void) | null = null;
  private textFallbackVoice = "";
  private textRaf = 0;
  private textLast = 0;
  private dialogueKey = "";
  private dialogueHidden = false;
  private dialogueOpacity = 1;
  private immersive = false;
  private language: "ja" | "en" = "ja";
  private typewriterMode: "char" | "word" | "instant" = "char";

  private choiceResolve: ((label: string) => void) | null = null;
  private pendingChoice: Option[] | null = null;
  private pendingChoiceSource: Option[] | null = null;
  private flags = new Map<number, number>();
  private mapMode = false;
  private party = new Set<string>();

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
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.scale(RENDER_SCALE, RENDER_SCALE);
    this.ctx = ctx;
    this.commands = script.commands;
    this.labels = script.labels;
    this.assets = assets;
    this.events = events;
    this.pack = pack;
    this.scene = scene.replace(/\.txt$/i, "").toLowerCase();
    this.loadScript = loadScript;
    this.audio = new AudioEngine(pack);
    this.stageRenderer = new StageRenderer(
      pack,
      assets,
      (text) => this.events.log(text),
      () => this.paused,
      () => this.stopped,
    );
  }

  get currentScene(): string {
    return this.scene;
  }

  get currentCommands(): Command[] {
    return this.commands;
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
      party: [...this.party],
      mapMode: this.mapMode,
      protagonist: protagonistOfScene(this.scene),
      speaker: this.textSpeaker || undefined,
      dialogue: this.textActive
        ? (this.textPages[this.textPage] ?? "").slice(0, 160)
        : undefined,
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
    this.pendingChoiceSource = null;
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
    return this.audio.prime();
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
      mapMode: this.mapMode,
      party: [...this.party],
      stage: this.stageSnapshot(),
      audio: this.audioState(),
    };
  }

  audioState(): AudioDebug {
    return this.audio.snapshot();
  }

  stageSnapshot(): StageSnapshot {
    return this.stageRenderer.snapshot();
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

  setImmersive(immersive: boolean): void {
    if (this.immersive === immersive) return;
    this.immersive = immersive;
    this.draw();
  }

  setTypewriterMode(mode: "char" | "word" | "instant"): void {
    if (this.typewriterMode === mode) return;
    this.typewriterMode = mode;
    if (this.textActive) {
      if (mode === "instant") {
        if (this.textRaf) cancelAnimationFrame(this.textRaf);
        this.textRaf = 0;
        this.textChars = this.currentPageText().length;
        this.textComplete = true;
      } else if (!this.textComplete) {
        this.scheduleTyping();
      }
    }
    this.draw();
  }

  setLanguage(language: "ja" | "en"): void {
    if (this.language === language) return;
    this.language = language;
    if (this.textActive) {
      const page = this.currentPageText();
      this.textChars = page.length;
      this.textComplete = true;
    }
    if (this.pendingChoiceSource) {
      this.pendingChoice = this.translateChoice(this.pendingChoiceSource);
      this.events.choice?.(this.pendingChoice);
    }
    this.draw();
  }

  async unlockAudio(): Promise<void> {
    return this.audio.unlock();
  }

  suspendBgm(): void {
    this.audio.suspend();
  }

  resumeBgm(): void {
    this.audio.resume();
  }

  private readonly redraw = (): void => {
    if (!this.stopped) this.draw();
  };

  start(
    pc = 0,
    imageName = "",
    flags?: Record<string, number>,
    stageSnapshot?: StageSnapshot,
    party?: string[],
    mapMode?: boolean,
  ): void {
    this.pc = this.rewindForVoice(Math.max(0, pc));
    this.stageRenderer.reset();
    this.running = true;
    this.paused = false;
    this.stopped = false;
    this.dialogueHidden = false;
    this.flags = new Map(
      Object.entries(flags ?? {}).map(([k, v]) => [Number.parseInt(k, 10), v]),
    );
    this.mapMode = mapMode ?? false;
    this.party = new Set(party ?? []);
    this.audio.resetForStart();
    this.resetText();
    this.events.status("playing");
    this.events.position?.(this.scene, this.currentPC);
    window.addEventListener("resize", this.redraw);
    document.addEventListener("fullscreenchange", this.redraw);
    this.stageRenderer.prefetch(this.commands, this.pc);

    const restore = async () => {
      const snap = stageSnapshot;
      if (snap) {
        const bgs = snap.bgs && snap.bgs.length > 0 ? snap.bgs : snap.bg ? [snap.bg] : [];
        await this.stageRenderer.restoreBackgrounds(bgs);
        await Promise.all([
          this.stageRenderer.restoreSlot("l", snap.l),
          this.stageRenderer.restoreSlot("r", snap.r),
          this.stageRenderer.restoreSlot("c", snap.c),
        ]);
      } else if (this.pc > 0) {
        this.events.loading(true);
        await this.restoreBefore(this.pc);
        this.events.loading(false);
      } else if (imageName) {
        await this.stageRenderer.restoreBackgrounds([imageName]);
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

  /** Rebuild stage, flags and BGM by replaying commands before a scene link. */
  private async restoreBefore(pc: number): Promise<void> {
    const stage = emptyStage();
    let music = "";
    for (let i = 0; i < pc && i < this.commands.length; i++) {
      const c = this.commands[i];
      const args = c.args ?? [];
      switch (c.cmd) {
        case "BMP":
          if (c.args) await this.stageRenderer.applyBmp(stage, c.args);
          break;
        case "MUS":
          music = args[0] ?? "";
          break;
        case "MAP":
          this.mapMode = (args[0] ?? "").toUpperCase() === "ON";
          break;
        case "PARTY": {
          const mode = (args[0] ?? "").toUpperCase();
          const name = args[1] ?? "";
          if (name) {
            if (mode === "IN") this.party.add(name);
            else if (mode === "OUT") this.party.delete(name);
          }
          break;
        }
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
    this.stageRenderer.setStage(stage);
    if (music && music.toUpperCase() !== "STOP") this.playBgm(music);
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
    this.pendingChoiceSource = null;
    this.events.choice?.(null);
    if (choiceResolve) choiceResolve("");
    this.audio.stop();
  }

  setPaused(paused: boolean): void {
    if (!this.running || this.stopped) return;
    this.paused = paused;
    this.events.status(paused ? "paused" : "playing");
    this.audio.setPaused(paused);
  }

  togglePaused(): boolean {
    this.setPaused(!this.paused);
    return this.paused;
  }

  /** True when the current page has a person-voice clip to replay. */
  get hasReplayVoice(): boolean {
    return !!this.currentVoiceName();
  }

  /** Replay the current page's voice without advancing dialogue. */
  replayVoice(): boolean {
    const name = this.currentVoiceName();
    if (!name) return false;
    this.playSe(name);
    return true;
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
    const page = this.currentPageText();
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

  setBgmVolume(volume: number): void {
    this.audio.setBgmVolume(volume);
  }

  setSeVolume(volume: number): void {
    this.audio.setSeVolume(volume);
  }

  setMuted(muted: boolean): void {
    this.audio.setMuted(muted);
  }

  private asset(
    kind: "game" | "bgm" | "se" | "text",
    name: string | undefined,
  ): string | null {
    if (!name) return null;
    return this.assets[kind]?.[name.toLowerCase()] ?? null;
  }

  private draw(): void {
    this.stageRenderer.draw(this.ctx, () => this.drawText());
  }

  private resetText(): void {
    if (this.textRaf) cancelAnimationFrame(this.textRaf);
    this.textRaf = 0;
    this.textFallbackVoice = "";
    this.textPagesEN = [];
    this.textActive = false;
    this.textComplete = false;
    this.emitDialogue(null);
    this.textWaitersResolve();
  }

  private textWaitersResolve(): void {
    const resolve = this.textResolve;
    this.textResolve = null;
    if (resolve) resolve();
  }

  private showText(
    speaker: string,
    message: string,
    cues: Cue[] = [],
    messageEN = "",
  ): Promise<void> {
    const pages = splitPages(message);
    const pagesEN = splitPages(messageEN);
    if (this.textRaf) cancelAnimationFrame(this.textRaf);
    this.textRaf = 0;
    // Drop the previous line before the new one is painted; otherwise React
    // can briefly show the old/full text while the new typewriter starts.
    this.emitDialogue(null);
    // Expand one-character speaker tags ("八", "阿", ...) for the name tag.
    this.textSpeaker = speakerDisplayName(speaker);
    this.textSpeakerEN = speakerEnglishName(speaker);
    this.textCues = cues;
    this.textPages = pages.length > 0 ? pages : [""];
    this.textPagesEN = pagesEN;
    this.textPage = 0;
    this.textChars = 0;
    this.textComplete = false;
    this.textActive = true;
    if (this.typewriterMode === "instant") {
      this.textChars = this.currentPageText().length;
      this.textComplete = true;
      this.draw();
    } else {
      this.draw();
      this.scheduleTyping();
    }
    this.playCues(0);
    return new Promise((resolve) => {
      this.textResolve = resolve;
    });
  }

  private translateChoice(options: Option[]): Option[] {
    return options.map((option) => ({
      ...option,
      text: this.language === "en" && option.textEn ? option.textEn : option.text,
    }));
  }

  private currentPageText(): string {
    const jp = this.textPages[this.textPage] ?? "";
    if (this.language === "en") return this.textPagesEN[this.textPage] || jp;
    return jp;
  }

  private playCues(page: number): void {
    for (const cue of this.textCues) {
      if (cue.page === page) this.playSe(cue.name);
    }
  }

  private showChoice(options: Option[]): Promise<string> {
    if (options.length === 0) return Promise.resolve("");
    this.pendingChoiceSource = options;
    const shown = this.translateChoice(options);
    this.pendingChoice = shown;
    this.events.choice?.(shown);
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
      const page = this.currentPageText();
      if (this.typewriterMode === "instant") {
        this.textChars = page.length;
        this.textLast = now;
      } else if (this.typewriterMode === "word") {
        if (!this.paused && now - this.textLast >= 45) {
          this.textChars = nextTypewriterBoundary(page, this.textChars);
          this.textLast = now;
        }
      } else {
        if (!this.paused) {
          // The first RAF timestamp can be slightly earlier than the
          // performance.now() captured by scheduleTyping. A negative elapsed
          // value would make textChars negative, and slice(0, -N) would flash
          // the end of the full line before typing starts.
          const elapsed = Math.max(0, now - this.textLast);
          this.textChars = Math.min(page.length, this.textChars + (elapsed * TEXT_CPS) / 1000);
        }
        this.textLast = now;
      }
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

  private isVoiceName(name: string): boolean {
    return /^[a-z0-9]+_/i.test(name) && !/^SE/i.test(name);
  }

  private currentVoiceName(): string {
    if (!this.textActive) return "";
    const cue = this.textCues.find((c) => c.page === this.textPage && c.kind === "voice");
    if (cue) return cue.name;
    if (!this.textCues.some((c) => c.kind === "voice")) return this.textFallbackVoice;
    return "";
  }

  private finishText(): void {
    if (this.textRaf) cancelAnimationFrame(this.textRaf);
    this.textRaf = 0;
    this.textActive = false;
    this.textComplete = false;
    this.textPages = [];
    this.textPagesEN = [];
    this.textCues = [];
    this.textFallbackVoice = "";
    this.textPage = 0;
    this.textChars = 0;
    this.draw();
    this.textWaitersResolve();
  }

  private emitDialogue(state: DialogueOverlayState | null): void {
    const key = state
      ? [
          state.speaker,
          state.text,
          state.complete ? "1" : "0",
          state.opacity,
          state.showReplay ? "1" : "0",
          state.immersive ? "1" : "0",
        ].join("\u0000")
      : "";
    if (key === this.dialogueKey) return;
    this.dialogueKey = key;
    this.events.dialogue?.(state);
  }

  private drawText(): void {
    if (!this.textActive || this.dialogueHidden) {
      this.emitDialogue(null);
      return;
    }
    const page = this.currentPageText();
    // slice(0, -1) returns almost the whole string. Guard against a negative
    // typewriter index from a first RAF timestamp older than textLast.
    const visibleChars = Math.max(0, Math.min(page.length, Math.floor(this.textChars)));
    this.emitDialogue({
      speaker: this.language === "en" ? this.textSpeakerEN : this.textSpeaker,
      text: page.slice(0, visibleChars),
      translation: this.textPagesEN[this.textPage] || "",
      complete: this.textComplete,
      opacity: this.dialogueOpacity,
      showReplay: this.hasReplayVoice,
      immersive: this.immersive,
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

  private playBgm(name: string | undefined): void {
    if (!name) return;
    if (name.toUpperCase() === "STOP") {
      this.audio.stopBgm();
      return;
    }
    const rel = this.asset("bgm", name);
    if (!rel) {
      this.events.log(`missing bgm: ${name}`);
      return;
    }
    this.events.asset?.("music", name);
    this.audio.playBgm(rel);
  }

  private playSe(name: string | undefined): void {
    if (!name || name === "同") return;
    const rel = this.asset("se", name);
    if (!rel) {
      this.events.log(`missing se: ${name}`);
      return;
    }
    this.audio.playSe(rel, name);
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
            await this.showText(c.speaker ?? "", c.message ?? "", c.cues ?? [], c.messageEn ?? "");
            break;
          case "BMP":
            if (args[0]) this.events.asset?.("image", args[0]);
            this.stageRenderer.queueBmp(args);
            break;
          case "UPD": {
            const kind = args[0] || "クロス";
            if (this.stageRenderer.hasPending) {
              this.events.loading(true);
              await this.stageRenderer.commitPending(kind, this.ctx, () => this.drawText());
              this.events.loading(false);
              this.stageRenderer.prefetch(this.commands, this.pc);
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
          case "SEV": {
            const name = args[0];
            if (name && this.isVoiceName(name)) this.textFallbackVoice = name;
            else this.textFallbackVoice = "";
            this.playSe(name);
            break;
          }
          case "STS":
            this.events.log(`title: ${args.join(" ")}`);
            break;
          case "TITLE":
            this.events.title?.();
            this.running = false;
            this.stopped = true;
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
              this.stageRenderer.prefetch(this.commands, this.pc);
            } catch (err) {
              this.events.log(`failed to load ${name}: ${String(err)}`);
              this.stopped = true;
            }
            break;
          }
          case "MAP": {
            const mode = (args[0] ?? "").toUpperCase();
            this.mapMode = mode === "ON";
            this.events.log(`map ${mode === "ON" ? "on" : "off"}`);
            break;
          }
          case "PARTY": {
            const mode = (args[0] ?? "").toUpperCase();
            const name = args[1] ?? "";
            if (name) {
              if (mode === "IN") this.party.add(name);
              else if (mode === "OUT") this.party.delete(name);
              this.events.log(`party ${mode} ${name}`);
            }
            break;
          }
          case "LEVEL":
            this.events.log(`level ${args.join(" ")}`);
            break;
          case "BATTLE": {
            const background = args[0] ?? "";
            const battleScript = args[1] ?? "";
            this.events.status(`battle: ${battleScript || background}`);
            const outcome =
              (await this.events.battle?.({
                background,
                script: battleScript,
                party: [...this.party],
              })) ?? "win";
            if (this.stopped) break;
            this.events.log(`battle ${background} ${battleScript} -> ${outcome}`);
            this.setFlag("20", outcome === "win" ? 1 : 0);
            this.events.status("playing");
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
    this.pendingChoiceSource = null;
    this.events.choice?.(null);
    this.events.loading(false);
    this.events.status("ended");
    this.events.ended();
  }
}
