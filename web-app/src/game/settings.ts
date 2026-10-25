export type BattlePolicy = "play" | "win" | "lose" | "random";
export type Language = "ja" | "en";

export interface StoredSettings {
  bgmVolume: number;
  seVolume: number;
  muted: boolean;
  dialogOpacity: number;
  immersiveMode: boolean;
  battlePolicy: BattlePolicy;
  language: Language;
}

export const SETTINGS_KEY = "mitama.settings.v1";

export const DEFAULT_SETTINGS: StoredSettings = {
  bgmVolume: 0.7,
  seVolume: 0.7,
  muted: false,
  dialogOpacity: 1,
  immersiveMode: false,
  battlePolicy: "play",
  language: "ja",
};

function volumeSetting(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}

export function readSettings(): StoredSettings {
  let saved: Partial<StoredSettings> = {};
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredSettings> | null;
      if (parsed && typeof parsed === "object") saved = parsed;
    }
  } catch {
    saved = {};
  }

  let legacyOpacity: number | undefined;
  let legacyBattle: string | null = null;
  try {
    const raw = localStorage.getItem("mitama.dialogOpacity");
    if (raw !== null) legacyOpacity = Number(raw);
    legacyBattle = localStorage.getItem("mitama.battlePolicy");
  } catch {
    // localStorage may be unavailable
  }

  const opacity = volumeSetting(
    saved.dialogOpacity,
    volumeSetting(legacyOpacity, DEFAULT_SETTINGS.dialogOpacity),
  );
  const language: Language = saved.language === "en" ? "en" : "ja";
  const battle =
    saved.battlePolicy === "play" ||
    saved.battlePolicy === "win" ||
    saved.battlePolicy === "lose" ||
    saved.battlePolicy === "random"
      ? saved.battlePolicy
      : legacyBattle === "win" ||
          legacyBattle === "lose" ||
          legacyBattle === "random" ||
          legacyBattle === "play"
        ? legacyBattle
        : DEFAULT_SETTINGS.battlePolicy;

  return {
    bgmVolume: volumeSetting(saved.bgmVolume, DEFAULT_SETTINGS.bgmVolume),
    seVolume: volumeSetting(saved.seVolume, DEFAULT_SETTINGS.seVolume),
    muted: typeof saved.muted === "boolean" ? saved.muted : DEFAULT_SETTINGS.muted,
    dialogOpacity: opacity,
    immersiveMode: typeof saved.immersiveMode === "boolean" ? saved.immersiveMode : DEFAULT_SETTINGS.immersiveMode,
    battlePolicy: battle,
    language,
  };
}

export function writeSettings(settings: StoredSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // best-effort setting persistence
  }
}
