export interface Option {
  text: string;
  label: string;
}

export interface Cue {
  page: number;
  name: string;
  kind: "voice" | "se";
}

export interface Command {
  line: number;
  cmd?: string;
  args?: string[];
  label?: string;
  text?: string;
  speaker?: string;
  message?: string;
  cues?: Cue[];
  options?: Option[];
}

export interface Script {
  commands: Command[];
  labels: Record<string, number>;
}

export interface AssetMap {
  game: Record<string, string>;
  bgm: Record<string, string>;
  se: Record<string, string>;
  text: Record<string, string>;
}

export type Protagonist = "yahiro" | "oboro";

/** Route prefix: eY* / Y* = 八尋, eO* / O* = 朧. */
export function protagonistOfScene(scene?: string): Protagonist | undefined {
  const name = (scene ?? "").trim().toLowerCase();
  if (/^e?y[a-z0-9_]/.test(name)) return "yahiro";
  if (/^e?o[a-z0-9_]/.test(name)) return "oboro";
  return undefined;
}

export function protagonistLabel(protagonist?: Protagonist): string {
  return protagonist === "yahiro"
    ? "八尋編"
    : protagonist === "oboro"
      ? "朧編"
      : "";
}

/** Visible dialogue state rendered by the DOM overlay. */
export interface DialogueOverlayState {
  speaker: string;
  text: string;
  complete: boolean;
  opacity: number;
  showReplay: boolean;
  immersive: boolean;
}

export interface PackInfo {
  id: string;
  title: string;
  script?: string;
  startScript?: string;
  root: string;
  hasVoice?: boolean;
}
