const SHORTCUTS: Array<[string, string]> = [
  ["Click / Enter / ↓ / →", "Advance dialogue"],
  ["Space", "Hide / show dialogue and HUD"],
  ["L", "Switch Japanese / English"],
  ["M", "Mute / unmute audio"],
  ["F", "Toggle fullscreen"],
  ["N", "Open page/chapter navigator"],
  ["G", "Open gallery"],
  ["I", "Toggle immersive subtitles"],
  ["P", "Pause / resume"],
  ["D", "Toggle engine debug panel"],
  ["Esc", "Close help or the active panel"],
  ["?", "Show / hide this help"],
];

export default function HelpPanel({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="help-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={(ev) => {
        ev.stopPropagation();
        onClose();
      }}
    >
      <div className="help-panel" onClick={(ev) => ev.stopPropagation()}>
        <header className="help-head">
          <div>
            <strong>Keyboard shortcuts</strong>
            <span>Press ? again to close</span>
          </div>
          <button onClick={onClose} aria-label="Close help">
            ✕
          </button>
        </header>
        <dl className="help-list">
          {SHORTCUTS.map(([key, action]) => (
            <div key={key} className="help-row">
              <dt>
                {key.split(" / ").map((part) => (
                  <kbd key={part}>{part}</kbd>
                ))}
              </dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
        <footer className="help-foot">
          Dialogue text is DOM, so you can drag-select and copy it without
          advancing.
        </footer>
      </div>
    </div>
  );
}
