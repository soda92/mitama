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
