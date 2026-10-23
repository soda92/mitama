import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player, type Snapshot } from "./game/player";
import type { AssetMap, Option, PackInfo, Script } from "./game/types";

interface GameData {
  script: Script;
  assets: AssetMap;
}

interface ResumePoint {
  pc: number;
  image: string;
}

const EMPTY_ASSETS: AssetMap = { game: {}, bgm: {}, se: {}, text: {} };
const SAVE_KEY = "mitama.saves.v1";
const SLOT_COUNT = 4;

function readSaves(): (Snapshot | null)[] {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return Array(SLOT_COUNT).fill(null);
    const parsed = JSON.parse(raw) as (Snapshot | null)[];
    const out = Array(SLOT_COUNT).fill(null);
    for (let i = 0; i < SLOT_COUNT; i++) out[i] = parsed[i] ?? null;
    return out;
  } catch {
    return Array(SLOT_COUNT).fill(null);
  }
}

function writeSaves(saves: (Snapshot | null)[]): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(saves));
  } catch {
    // localStorage may be unavailable or full; saves are best-effort.
  }
}

function initialParams(): { pack: string; scene: string; pc: number } {
  const q = new URLSearchParams(window.location.search);
  const pc = Number.parseInt(q.get("cmd") ?? "0", 10);
  return {
    pack: q.get("pack") ?? "",
    scene: q.get("scene") ?? "",
    pc: Number.isFinite(pc) ? Math.max(0, pc) : 0,
  };
}

export default function App() {
  const params = useMemo(initialParams, []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);

  const [packs, setPacks] = useState<PackInfo[]>([]);
  const [packId, setPackId] = useState<string>("");
  const [resumeScene, setResumeScene] = useState(params.scene);
  const [resume, setResume] = useState<ResumePoint>({ pc: params.pc, image: "" });
  const [reloadKey, setReloadKey] = useState(0);
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
  const [choices, setChoices] = useState<Option[] | null>(null);
  const [saves, setSaves] = useState<(Snapshot | null)[]>(readSaves);
  const [saveMode, setSaveMode] = useState<"save" | "load" | null>(null);

  const pack = useMemo(() => packs.find((p) => p.id === packId), [packs, packId]);
  const startScene = (resumeScene || pack?.startScript || "").replace(/\.txt$/i, "");

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
        const requested = params.pack;
        const initial =
          body.packs.find((p) => p.id === requested) ??
          body.packs.find((p) => p.startScript) ??
          body.packs[0];
        setPackId(initial?.id ?? "");
        if (initial?.id !== requested) {
          setResumeScene("");
          setResume({ pc: 0, image: "" });
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.pack]);

  // Load the selected pack's script and asset index.
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
        const scriptURL = resumeScene
          ? `/api/script?pack=${encodeURIComponent(packId)}&name=${encodeURIComponent(resumeScene)}`
          : `/api/script?pack=${encodeURIComponent(packId)}`;
        const [scriptRes, assetsRes] = await Promise.all([
          fetch(scriptURL),
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
  }, [packId, resumeScene, reloadKey]);

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

  const updateURL = useCallback(
    (scene: string, pc: number) => {
      const url = new URL(window.location.href);
      if (packId) url.searchParams.set("pack", packId);
      if (scene) url.searchParams.set("scene", scene);
      else url.searchParams.delete("scene");
      url.searchParams.set("cmd", String(Math.max(0, pc)));
      window.history.replaceState(null, "", url.toString());
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
          setChoices(null);
        },
        error: (message) => {
          setError(message);
          setStatus("error");
        },
        position: updateURL,
        choice: setChoices,
      },
      packId,
      startScene,
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
  }, [data, packId, startScene, loadScript, updateURL]);

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
    setChoices(null);
    player.start(resume.pc, resume.image);
    setResume({ pc: 0, image: "" });
  }, [resume]);

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

  const choose = useCallback((label: string) => {
    setChoices(null);
    playerRef.current?.choose(label);
  }, []);

  const saveTo = useCallback(
    (slot: number) => {
      const player = playerRef.current;
      if (!player) return;
      const snap = player.snapshot();
      try {
        snap.thumbnail = canvasRef.current?.toDataURL("image/jpeg", 0.55);
      } catch {
        // Thumbnail is optional.
      }
      setSaves((prev) => {
        const next = [...prev];
        next[slot] = snap;
        writeSaves(next);
        return next;
      });
      setSaveMode(null);
    },
    [],
  );

  const loadFrom = useCallback(
    (slot: number) => {
      const snap = saves[slot];
      if (!snap) return;
      setSaveMode(null);
      setChoices(null);
      setStarted(false);
      setEnded(false);
      setPaused(false);
      setResumeScene(snap.scene);
      setResume({ pc: snap.pc, image: snap.image });
      if (snap.pack !== packId) setPackId(snap.pack);
      setReloadKey((k) => k + 1);
      updateURL(snap.scene, snap.pc);
    },
    [saves, packId, updateURL],
  );

  const reloadCurrent = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    setStarted(false);
    setEnded(false);
    setPaused(false);
    setChoices(null);
    setResumeScene(player.currentScene);
    setResume({ pc: player.currentPC, image: "" });
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (saveMode) return;
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
  }, [started, togglePause, toggleFullscreen, advance, saveMode]);

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
              onChange={(ev) => {
                setPackId(ev.target.value);
                setResumeScene("");
                setResume({ pc: 0, image: "" });
              }}
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

        {choices && choices.length > 0 && (
          <div className="choice-overlay">
            <div className="choice-panel">
              {choices.map((opt, i) => (
                <button
                  key={`${opt.label}-${i}`}
                  className="choice"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    choose(opt.label);
                  }}
                >
                  {opt.text}
                </button>
              ))}
            </div>
          </div>
        )}

        {saveMode && (
          <div
            className="save-overlay"
            onClick={(ev) => {
              ev.stopPropagation();
              setSaveMode(null);
            }}
          >
            <div className="save-panel" onClick={(ev) => ev.stopPropagation()}>
              <div className="save-head">
                <strong>{saveMode === "save" ? "Save game" : "Load game"}</strong>
                <button onClick={() => setSaveMode(null)}>✕</button>
              </div>
              <div className="slots">
                {saves.map((snap, i) => (
                  <button
                    key={i}
                    className={`slot ${snap ? "filled" : ""}`}
                    onClick={() => (saveMode === "save" ? saveTo(i) : loadFrom(i))}
                    disabled={saveMode === "load" && !snap}
                  >
                    {snap?.thumbnail ? (
                      <img src={snap.thumbnail} alt="" />
                    ) : (
                      <span className="slot-empty">{saveMode === "save" ? "empty" : "no data"}</span>
                    )}
                    <span className="slot-meta">
                      <b>Slot {i + 1}</b>
                      {snap ? (
                        <>
                          <em>{snap.scene || snap.pack}</em>
                          <small>
                            cmd {snap.pc} · {new Date(snap.savedAt).toLocaleString()}
                          </small>
                        </>
                      ) : (
                        <small>{saveMode === "save" ? "click to save here" : "—"}</small>
                      )}
                    </span>
                  </button>
                ))}
              </div>
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
        <button onClick={() => setSaveMode("save")} disabled={!started} title="Save">
          Save
        </button>
        <button onClick={() => setSaveMode("load")} disabled={saves.every((s) => !s)} title="Load">
          Load
        </button>
        <button onClick={reloadCurrent} disabled={!started} title="Reload scene">
          ↻
        </button>
        <div className="log">{log}</div>
      </footer>
    </main>
  );
}
