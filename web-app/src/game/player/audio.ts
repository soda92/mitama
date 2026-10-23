export interface AudioSnapshot {
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

/**
 * Owns the HTML audio elements and the browser autoplay/unlock state.
 * BGM is a single looping element; SE/voice clips are one-shot elements.
 */
export class AudioEngine {
  private bgm: HTMLAudioElement | null = null;
  private bgmWanted = false;
  private audioUnlocked = false;
  private primePromise: Promise<void> | null = null;
  private paused = false;
  private suspended = false;
  private bgmVolume = 0.7;
  private seVolume = 0.7;
  private muted = false;
  private readonly liveSe = new Set<HTMLAudioElement>();
  private lastSeName = "";
  private lastSeAt = 0;

  constructor(private readonly pack: string) {}

  async prime(): Promise<void> {
    if (this.audioUnlocked) return;
    if (this.primePromise) return this.primePromise;
    this.primePromise = this.doPrime();
    try {
      await this.primePromise;
    } finally {
      this.primePromise = null;
    }
  }

  private async doPrime(): Promise<void> {
    const a = this.ensureBgm();
    if (a.dataset.track && !a.paused) {
      this.audioUnlocked = true;
      return;
    }
    a.volume = 0;
    try {
      await a.play();
      this.audioUnlocked = true;
      a.pause();
      a.currentTime = 0;
    } catch {
      // Autoplay may still be blocked; BGM will start on the next attempt.
    } finally {
      a.volume = this.bgmGain();
    }
  }

  async unlock(): Promise<void> {
    if (this.bgm?.dataset.track && !this.bgm.paused) {
      this.audioUnlocked = true;
      return;
    }
    await this.prime();
    if (this.bgmWanted && !this.paused && !this.suspended && this.bgm?.dataset.track && this.bgm.paused) {
      await this.bgm.play().catch(() => undefined);
    }
  }

  resetForStart(): void {
    this.bgmWanted = false;
  }

  playBgm(rel: string): void {
    this.bgmWanted = true;
    const a = this.ensureBgm();
    if (a.dataset.track !== rel) {
      a.src = this.url(rel);
      a.dataset.track = rel;
      a.currentTime = 0;
    }
    a.volume = this.bgmGain();
    if (!this.paused && !this.suspended) void a.play().catch(() => undefined);
  }

  suspend(): void {
    this.suspended = true;
    if (this.bgm) this.bgm.pause();
  }

  resume(): void {
    this.suspended = false;
    if (this.bgmWanted && !this.paused && this.bgm?.dataset.track) {
      void this.bgm.play().catch(() => undefined);
    }
  }

  stopBgm(): void {
    this.bgmWanted = false;
    if (!this.bgm) return;
    this.bgm.pause();
    this.bgm.currentTime = 0;
  }

  playSe(rel: string, name: string): void {
    this.lastSeName = name;
    this.lastSeAt = Date.now();
    const a = new Audio(this.url(rel));
    a.volume = this.seGain();
    this.liveSe.add(a);
    const done = () => this.liveSe.delete(a);
    a.addEventListener("ended", done, { once: true });
    a.addEventListener("error", done, { once: true });
    void a.play().catch(done);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (this.bgm) {
      if (paused) this.bgm.pause();
      else if (this.bgmWanted) void this.bgm.play().catch(() => undefined);
    }
    for (const a of this.liveSe) {
      if (paused) a.pause();
      else void a.play().catch(() => undefined);
    }
  }

  stop(): void {
    this.bgmWanted = false;
    if (this.bgm) this.bgm.pause();
    for (const a of this.liveSe) a.pause();
    this.liveSe.clear();
  }

  setBgmVolume(volume: number): void {
    this.bgmVolume = Math.max(0, Math.min(1, volume));
    if (this.bgm) this.bgm.volume = this.bgmGain();
  }

  setSeVolume(volume: number): void {
    this.seVolume = Math.max(0, Math.min(1, volume));
    for (const a of this.liveSe) a.volume = this.seGain();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.bgm) this.bgm.volume = this.bgmGain();
    for (const a of this.liveSe) a.volume = this.seGain();
  }

  snapshot(): AudioSnapshot {
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

  private ensureBgm(): HTMLAudioElement {
    if (!this.bgm) {
      this.bgm = new Audio();
      this.bgm.loop = true;
      this.bgm.preload = "auto";
      this.bgm.volume = this.bgmGain();
    }
    return this.bgm;
  }

  private bgmGain(): number {
    return this.muted ? 0 : this.bgmVolume;
  }

  private seGain(): number {
    return this.muted ? 0 : this.seVolume;
  }

  private url(rel: string): string {
    if (rel.toLowerCase().endsWith(".xa")) {
      return `/api/audio?pack=${encodeURIComponent(this.pack)}&file=${encodeURIComponent(rel)}`;
    }
    return `/media/${this.pack}/${rel}`;
  }
}
