export interface Option {
  text: string;
  textEn?: string;
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
  messageEn?: string;
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


const SPEAKER_NAMES_EN: Record<string, string> = {
  八尋: "Yahiro",
  蘭: "Ran",
  朧: "Oboro",
  阿門: "Amon",
  更紗: "Sarasa",
  諏慧姫: "Suikihime",
  紅羽: "Kureha",
  瑞希: "Mizuki",
  我吽: "Gaun",
  紫芳: "Shihou",
  阿佐弥: "Asami",
  文観: "Bunkan",
  七巳: "Nanami",
  耳目: "Jimoku",
  長虫: "Nagamushi",
  五鬼: "Goki",
  素戔鳴: "Susanoo",
  お館: "Master",
  関番: "Guard",
  随身: "Attendant",
  阿闍梨: "Ajari",
  猿: "Monkey",
  子供: "Child",
};

export function speakerEnglishName(speaker?: string): string {
  const jp = speakerDisplayName(speaker);
  if (!jp) return "";
  return jp
    .split("・")
    .map((part) => SPEAKER_NAMES_EN[part] ?? part)
    .join(" / ");
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
  translation?: string;
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
