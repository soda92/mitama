interface DialogueToolbarProps {
  started: boolean;
  archiveOpen: boolean;
  navigatorOpen: boolean;
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
        title="Archives"
      >
        Archives
      </button>
      <button
        className={`tool ${navigatorOpen ? "on" : ""}`}
        onClick={onNavigator}
        disabled={scriptCount === 0}
        title="Navigator (N)"
      >
        Navigate
      </button>
      <button className="tool" onClick={onLanguage} title="Language (L)">
        {language === "ja" ? "EN" : "JA"}
      </button>
      <button className="tool" onClick={onMute} title="Mute (M)">
        {muted ? "Unmute" : "Mute"}
      </button>
      <button className="tool" onClick={onFullscreen} title="Fullscreen (F)">
        ⛶
      </button>
      <button className="tool" onClick={onSettings} title="Settings">
        ☰
      </button>
    </div>
  );
}
