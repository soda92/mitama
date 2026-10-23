import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player } from "./game/player";
import type { AssetMap, PackInfo, Script } from "./game/types";

interface GameData {
  script: Script;
  assets: AssetMap;
}

const EMPTY_ASSETS: AssetMap = { game: {}, bgm: {}, se: {}, text: {} };

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);

  const [packs, setPacks] = useState<PackInfo[]>([]);
  const [packId, setPackId] = useState<string>("");
  const [data, setData] = useState<GameData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("loading");
  const [log, setLog] = useState("ready");

  const pack = useMemo(() => packs.find((p) => p.id === packId), [packs, packId]);

  // Load the pack list and choose a default.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/packs");
        if (!res.ok) throw new Error(`packs: HTTP ${res.status}`);
        const body = (await res.json()) as { packs: PackInfo[] };
        if (cancelled) return;
        setPacks(body.packs);
        const requested = new URLSearchParams(window.location.search).get("pack");
        const initial =
          body.packs.find((p) => p.id === requested) ??
          body.packs.find((p) => p.startScript) ??
          body.packs[0];
        setPackId(initial?.id ?? "");
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the selected pack's start script and asset index.
  useEffect(() => {
    if (!packId) return;
    let cancelled = false;
    setData(null);
    setError(null);
    setStarted(false);
    setEnded(false);
    setPaused(false);
    setStatus("loading script");
    (async () => {
      try {
        const [scriptRes, assetsRes] = await Promise.all([
          fetch(`/api/script?pack=${encodeURIComponent(packId)}`),
          fetch(`/api/assets?pack=${encodeURIComponent(packId)}`),
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
  }, [packId]);

  const loadScript = useCallback(
    async (name: string): Promise<Script> => {
      const res = await fetch(
        `/api/script?pack=${encodeURIComponent(packId)}&name=${encodeURIComponent(name)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as Script;
    },
    [packId],
  );

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
      packId,
      loadScript,
    );
    playerRef.current = player;
    player.setVolume(volume);
    return () => {
      player.stop();
      playerRef.current = null;
    };
    // Volume is applied separately below; it must not recreate the player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, packId, loadScript]);

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

  const advance = useCallback(() => {
    playerRef.current?.advance();
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stageRef.current?.requestFullscreen?.();
  }, []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        advance();
      } else if (ev.code === "Space") {
        ev.preventDefault();
        if (playerRef.current?.hasText) advance();
        else if (started) togglePause();
      } else if (ev.key === "m" || ev.key === "M") {
        setMuted((m) => !m);
      } else if (ev.key === "f" || ev.key === "F") {
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, togglePause, toggleFullscreen, advance]);

  const assets = data?.assets ?? EMPTY_ASSETS;
  const imageCount = Object.keys(assets.game).length;
  const bgmCount = Object.keys(assets.bgm).length;
  const seCount = Object.keys(assets.se).length;
  const scriptCount = Object.keys(assets.text).length;

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
        <div className="topright">
          {packs.length > 1 && (
            <select
              className="pack"
              value={packId}
              onChange={(ev) => setPackId(ev.target.value)}
              aria-label="data pack"
            >
              {packs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          )}
          <div className="status">{status}</div>
        </div>
      </header>

      <section className="stage-wrap" ref={stageRef} onClick={advance}>
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
                    ? "finished — press Start to replay"
                    : pack
                      ? pack.title
                      : `${imageCount} images · ${bgmCount} bgm · ${seCount} se`}
              </p>
              {pack && !error && !ended && (
                <p className="counts">
                  {imageCount.toLocaleString()} images · {bgmCount.toLocaleString()} bgm ·{" "}
                  {seCount.toLocaleString()} se
                  {scriptCount > 0 ? ` · ${scriptCount.toLocaleString()} scripts` : ""}
                </p>
              )}
              <button className="primary" onClick={start} disabled={!!error || !data}>
                {ended ? "Replay" : "Start"}
              </button>
              <p className="hint">Click / Enter: advance · Space: pause · M: mute · F: fullscreen</p>
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
