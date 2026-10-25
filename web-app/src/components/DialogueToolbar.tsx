interface DialogueToolbarProps {
  started: boolean;
  archiveOpen: boolean;
  navigatorOpen: boolean;
  menuOpen: boolean;
  scriptCount: number;
  muted: boolean;
  language: "ja" | "en";
  onArchives: () => void;
  onNavigator: () => void;
  onMute: () => void;
  onLanguage: () => void;
  onFullscreen: () => void;
  onSettings: () => void;
}

export default function DialogueToolbar({
  started,
  archiveOpen,
  navigatorOpen,
  menuOpen,
  scriptCount,
  muted,
  language,
  onLanguage,
  onArchives,
  onNavigator,
  onMute,
  onFullscreen,
  onSettings,
}: DialogueToolbarProps) {
  if (!started) return null;
  return (
    <div className="dialogue-tools" onClick={(ev) => ev.stopPropagation()}>
      <button
        className={`tool ${archiveOpen ? "on" : ""}`}
        onClick={onArchives}
        title="Saves (A)"
        aria-pressed={archiveOpen}
      >
        Saves
      </button>
      <button
        className={`tool ${navigatorOpen ? "on" : ""}`}
        onClick={onNavigator}
        disabled={scriptCount === 0}
        title="Story: chapters, map and branches (N)"
        aria-pressed={navigatorOpen}
      >
        Story
      </button>

      <span className="tool-sep" aria-hidden="true" />

      <button
        className="tool"
        onClick={onLanguage}
        title={`Language: ${language === "ja" ? "Japanese" : "English"} (L)`}
        aria-label={`Language: ${language === "ja" ? "Japanese" : "English"}`}
      >
        {language === "ja" ? "JA" : "EN"}
      </button>
      <button
        className={`tool ${muted ? "on" : ""}`}
        onClick={onMute}
        title={muted ? "Unmute (M)" : "Mute (M)"}
        aria-pressed={muted}
      >
        {muted ? "Muted" : "Sound"}
      </button>

      <span className="tool-sep" aria-hidden="true" />

      <button className="tool" onClick={onFullscreen} title="Fullscreen (F)">
        Full
      </button>
      <button
        className={`tool ${menuOpen ? "on" : ""}`}
        onClick={onSettings}
        title="Settings"
        aria-pressed={menuOpen}
      >
        Menu
      </button>
    </div>
  );
}
