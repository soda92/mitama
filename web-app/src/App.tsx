import { useCallback, useEffect, useRef, useState } from "react";
import { Player } from "./game/player";
import type { AssetMap, Script } from "./game/types";

const PACK = "demo";

interface GameData {
  script: Script;
  assets: AssetMap;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [data, setData] = useState<GameData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("loading script");
  const [log, setLog] = useState("ready");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [scriptRes, assetsRes] = await Promise.all([
          fetch(`/api/script?pack=${PACK}`),
          fetch(`/api/assets?pack=${PACK}`),
        ]);
        if (!scriptRes.ok) throw new Error(`script: HTTP ${scriptRes.status}`);
        if (!assetsRes.ok) throw new Error(`assets: HTTP ${assetsRes.status}`);
        const script = (await scriptRes.json()) as Script;
        const assets = (await assetsRes.json()) as AssetMap;
        if (cancelled) return;
        setData({ script, assets });
        setStatus(`${script.commands.length} commands`);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!data || !canvasRef.current) return;
    const player = new Player(
      canvasRef.current,
      data.script,
      data.assets,
      {
        status: setStatus,
        log: setLog,
        loading: setLoading,
        ended: () => {
          setStarted(false);
          setEnded(true);
          setPaused(false);
        },
        error: (message) => {
          setError(message);
          setStatus("error");
        },
      },
      PACK,
    );
    playerRef.current = player;
    player.setVolume(volume);
    return () => {
      player.stop();
      playerRef.current = null;
    };
    // Volume is applied separately below; it must not recreate the player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    playerRef.current?.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    playerRef.current?.setMuted(muted);
  }, [muted]);

  const start = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    // Do not block the script on audio unlock: headless browsers and some
    // devices never resolve play() until a real output device exists.
    void player.primeAudio();
    setEnded(false);
    setStarted(true);
    setPaused(false);
    player.start();
  }, []);

  const togglePause = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    setPaused(player.togglePaused());
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stageRef.current?.requestFullscreen?.();
  }, []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.code === "Space") {
        ev.preventDefault();
        if (started) togglePause();
      } else if (ev.key === "m" || ev.key === "M") {
        setMuted((m) => !m);
      } else if (ev.key === "f" || ev.key === "F") {
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, togglePause, toggleFullscreen]);

  const imageCount = data ? Object.keys(data.assets.game ?? {}).length : 0;
  const bgmCount = data ? Object.keys(data.assets.bgm ?? {}).length : 0;
  const seCount = data ? Object.keys(data.assets.se ?? {}).length : 0;

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="mark">御</span>
          <span>
            <strong>御魂 ～忍～</strong>
            <small>ARCANA engine · web player</small>
          </span>
        </div>
        <div className="status">{status}</div>
      </header>

      <section className="stage-wrap" ref={stageRef}>
        <canvas ref={canvasRef} width={640} height={480} aria-label="game screen" />
        {(!started || error) && (
          <div className="overlay">
            <div className="overlay-card">
              <h1>
                御魂 <span>～忍～</span>
              </h1>
              <p>
                {error
                  ? error
                  : ended
                    ? "demo finished — press Start to replay"
                    : `${imageCount} images · ${bgmCount} bgm · ${seCount} se`}
              </p>
              <button className="primary" onClick={start} disabled={!!error || !data}>
                {ended ? "Replay" : "Start"}
              </button>
              <p className="hint">Space: pause · M: mute · F: fullscreen</p>
            </div>
          </div>
        )}
        {loading && (
          <div className="loading">
            <span /> loading…
          </div>
        )}
      </section>

      <footer className="controls">
        <button onClick={togglePause} disabled={!started} title="Pause (Space)">
          {paused ? "▶" : "❚❚"}
        </button>
        <button onClick={toggleFullscreen} title="Fullscreen (F)">
          ⛶
        </button>
        <button onClick={() => setMuted((m) => !m)} title="Mute (M)">
          {muted ? "🔇" : "🔊"}
        </button>
        <div className="vol">
          <span>♪</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(ev) => setVolume(Number(ev.target.value) / 100)}
          />
        </div>
        <div className="log">{log}</div>
      </footer>
    </main>
  );
}
