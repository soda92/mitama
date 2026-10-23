interface DialogueToolbarProps {
  started: boolean;
  paused: boolean;
  archiveOpen: boolean;
  navigatorOpen: boolean;
  scriptCount: number;
  muted: boolean;
  onPause: () => void;
  onArchives: () => void;
  onNavigator: () => void;
  onMute: () => void;
  onFullscreen: () => void;
  onSettings: () => void;
}

export default function DialogueToolbar({
  started,
  paused,
  archiveOpen,
  navigatorOpen,
  scriptCount,
  muted,
  onPause,
  onArchives,
  onNavigator,
  onMute,
  onFullscreen,
  onSettings,
}: DialogueToolbarProps) {
  if (!started) return null;
  return (
    <div className="dialogue-tools" onClick={(ev) => ev.stopPropagation()}>
      <button className="tool" onClick={onPause} title="Pause (P)">
        {paused ? "▶" : "❚❚"}
      </button>
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
      <button className="tool" onClick={onMute} title="Mute (M)">
        {muted ? "🔇" : "🔊"}
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
