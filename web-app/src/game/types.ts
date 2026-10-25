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

const SPEAKER_NAMES: Record<string, string> = {
  八: "八尋",
  阿: "阿門",
  更: "更紗",
  諏: "諏慧姫",
  紅: "紅羽",
  瑞: "瑞希",
  我: "我吽",
  紫: "紫芳",
  弥: "阿佐弥",
  文: "文観",
  七: "七巳",
  耳: "耳目",
  長: "長虫",
  五: "五鬼",
  素: "素戔鳴",
  館: "お館",
  番: "関番",
  随: "随身",
  闍: "阿闍梨",
  三: "猿",
  子: "子供",
};

/**
 * Script speakers use one-character abbreviations. Keep the raw script token
 * in the API, but show a readable name in the dialogue tag.
 */
export function speakerDisplayName(speaker?: string): string {
  const raw = (speaker ?? "").trim().replace(/^→+/, "");
  if (!raw || raw === "説") return "";
  return raw
    .split("・")
    .map((part) => SPEAKER_NAMES[part.trim()] ?? part.trim())
    .join("・");
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
