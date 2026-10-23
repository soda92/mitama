export interface Command {
  line: number;
  cmd?: string;
  args?: string[];
  label?: string;
  text?: string;
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
  root: string;
  hasVoice?: boolean;
}
