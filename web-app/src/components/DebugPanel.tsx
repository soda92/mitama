import { useEffect, useState } from "react";
import type { DebugState } from "../game/player";

interface DebugPanelProps {
  getState: () => DebugState | null;
  log: string;
  status: string;
  onClose: () => void;
  onReload: () => void;
  onAdvance: () => void;
  onCopyLink: () => void;
}

export default function DebugPanel({
  getState,
  log,
  status,
  onClose,
  onReload,
  onAdvance,
  onCopyLink,
}: DebugPanelProps) {
  const [state, setState] = useState<DebugState | null>(null);

  useEffect(() => {
    const read = () => setState(getState());
    read();
    const timer = setInterval(read, 400);
    return () => clearInterval(timer);
  }, [getState]);

  const flags = state ? Object.entries(state.flags).sort((a, b) => Number(a[0]) - Number(b[0])) : [];
  const audio = state?.audio;
  const bgm = audio?.bgm;

  return (
    <aside className="debug-panel" onClick={(ev) => ev.stopPropagation()}>
      <div className="debug-head">
        <strong>Engine debug</strong>
        <button onClick={onClose} title="Close (D)">
          ✕
        </button>
      </div>

      <div className="debug-scroll">
        <section>
          <h4>Position</h4>
          <div className="kv">
            <span>pack</span>
            <b>{state?.pack || "—"}</b>
            <span>scene</span>
            <b>{state?.scene || "—"}</b>
            <span>pc</span>
            <b>{state?.pc ?? "—"}</b>
            <span>status</span>
            <b>{status}</b>
            <span>command</span>
            <b>
              {state?.command
                ? `${state.command.cmd ?? state.command.label ?? "?"} ${(state.command.args ?? []).join(" ")}`
                : "—"}
            </b>
          </div>
        </section>

        <section>
          <h4>Dialogue</h4>
          {state?.text.active ? (
            <div className="kv">
              <span>speaker</span>
              <b>{state.text.speaker || "—"}</b>
              <span>page</span>
              <b>
                {state.text.page}/{state.text.pages}
              </b>
              <span>chars</span>
              <b>
                {state.text.chars}/{state.text.length}
                {state.text.complete ? " ✓" : " …"}
              </b>
              <span>opacity</span>
              <b>{Math.round(state.dialogueOpacity * 100)}%</b>
            </div>
          ) : (
            <p className="muted">no dialogue</p>
          )}
          {state?.choice && (
            <div className="debug-choice">
              {state.choice.map((o) => (
                <div key={o.label}>
                  {o.text} → <b>{o.label}</b>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h4>Audio</h4>
          <div className="kv">
            <span>bgm</span>
            <b>{bgm?.track || "—"}</b>
            <span>state</span>
            <b>{bgm ? (bgm.paused ? "paused" : "playing") : "stopped"}</b>
            <span>time</span>
            <b>
              {bgm ? `${bgm.currentTime.toFixed(2)} / ${bgm.duration.toFixed(2)}s` : "—"}
            </b>
            <span>volume</span>
            <b>{bgm ? bgm.volume.toFixed(2) : "—"}</b>
            <span>last SE</span>
            <b>{audio?.lastSe || "—"}</b>
            <span>live SE</span>
            <b>{audio?.liveSe ?? 0}</b>
          </div>
        </section>

        <section>
          <h4>Stage</h4>
          <div className="kv">
            <span>bg</span>
            <b>{state?.stage.bg || "—"}</b>
            <span>L</span>
            <b>{state?.stage.l || "—"}</b>
            <span>R</span>
            <b>{state?.stage.r || "—"}</b>
            <span>C</span>
            <b>{state?.stage.c || "—"}</b>
          </div>
        </section>

        <section>
          <h4>Flags ({flags.length})</h4>
          {flags.length === 0 ? (
            <p className="muted">none</p>
          ) : (
            <div className="flag-grid">
              {flags.map(([id, value]) => (
                <div key={id}>
                  <span>{id}</span>
                  <b>{value}</b>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h4>Last command</h4>
          <p className="debug-log">{log}</p>
        </section>

        <div className="debug-actions">
          <button onClick={onAdvance}>Advance</button>
          <button onClick={onReload}>Reload scene</button>
          <button onClick={onCopyLink}>Copy link</button>
        </div>
      </div>
    </aside>
  );
}
