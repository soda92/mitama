export interface Option {
  text: string;
  label: string;
}

export interface Command {
  line: number;
  cmd?: string;
  args?: string[];
  label?: string;
  text?: string;
  speaker?: string;
  message?: string;
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

export interface PackInfo {
  id: string;
  title: string;
  script?: string;
  startScript?: string;
  root: string;
  hasVoice?: boolean;
}
