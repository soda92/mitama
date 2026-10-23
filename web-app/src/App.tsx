import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player, type Snapshot, type StageSnapshot } from "./game/player";
import DebugPanel from "./components/DebugPanel";
import type { AssetMap, Option, PackInfo, Script } from "./game/types";

interface GameData {
  script: Script;
  assets: AssetMap;
}

interface ResumePoint {
  pc: number;
  image: string;
  stage?: StageSnapshot;
  flags?: Record<string, number>;
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
  const [sceneMode, setSceneMode] = useState(false);
  const [sceneFilter, setSceneFilter] = useState("");
  const [uiHidden, setUiHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpacity, setDialogOpacity] = useState(() => {
    const raw = Number(localStorage.getItem("mitama.dialogOpacity"));
    return Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 1;
  });
  const [currentScene, setCurrentScene] = useState(params.scene);
  const [currentPC, setCurrentPC] = useState(params.pc);
  const [debugOpen, setDebugOpen] = useState(() => new URLSearchParams(window.location.search).has("debug"));

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
      setCurrentScene(scene);
      setCurrentPC(pc);
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

  // Debug surface for Chrome DevTools MCP / console use.
  useEffect(() => {
    if (!data) return;
    const debug = {
      state: () => playerRef.current?.debugState() ?? null,
      flags: () => playerRef.current?.flagState ?? {},
      audio: () => playerRef.current?.audioState() ?? null,
      stage: () => playerRef.current?.stageSnapshot() ?? null,
      scene: () => playerRef.current?.currentScene ?? "",
      pc: () => playerRef.current?.currentPC ?? 0,
      advance: () => playerRef.current?.advance(),
      choose: (label: string) => playerRef.current?.choose(label),
      setFlag: (id: number, value: number) => playerRef.current?.setDebugFlag(id, value),
      setDialogueOpacity: (value: number) => setDialogOpacity(value),
    };
    (window as Window & { __mitama?: typeof debug }).__mitama = debug;
    return () => {
      delete (window as Window & { __mitama?: typeof debug }).__mitama;
    };
  }, [data]);

  // Mirror the live state to the Go server so curl / external tools can inspect
  // it without attaching to the page.
  useEffect(() => {
    if (!data) return;
    const timer = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      void fetch("/api/debug/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(player.debugState()),
      }).catch(() => undefined);
    }, 1000);
    return () => clearInterval(timer);
  }, [data]);

  useEffect(() => {
    playerRef.current?.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    playerRef.current?.setDialogueHidden(uiHidden);
  }, [uiHidden, data]);

  useEffect(() => {
    playerRef.current?.setDialogueOpacity(dialogOpacity);
    try {
      localStorage.setItem("mitama.dialogOpacity", String(dialogOpacity));
    } catch {
      // best-effort setting persistence
    }
  }, [dialogOpacity, data]);

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
    setUiHidden(false);
    setChoices(null);
    player.start(resume.pc, resume.image, resume.flags, resume.stage);
    setResume({ pc: 0, image: "" });
  }, [resume]);

  // The player has no title screen: start as soon as data and the stage exist.
  useEffect(() => {
    if (!data || !playerRef.current || started || ended || error) return;
    start();
  }, [data, started, ended, error, start]);

  const togglePause = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    setPaused(player.togglePaused());
  }, []);

  const advance = useCallback(() => {
    playerRef.current?.unlockAudio();
    playerRef.current?.advance();
  }, []);

  const handleStageClick = useCallback(() => {
    if (uiHidden) {
      setUiHidden(false);
      return;
    }
    advance();
  }, [uiHidden, advance]);

  const restart = useCallback(() => {
    setData(null);
    setStarted(false);
    setEnded(false);
    setPaused(false);
    setUiHidden(false);
    setResumeScene("");
    setResume({ pc: 0, image: "" });
    setChoices(null);
    setReloadKey((k) => k + 1);
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
      setData(null);
      setStarted(false);
      setEnded(false);
      setPaused(false);
      setResumeScene(snap.scene);
      setResume({ pc: snap.pc, image: snap.image, stage: snap.stage, flags: snap.flags });
      if (snap.pack !== packId) setPackId(snap.pack);
      setReloadKey((k) => k + 1);
      updateURL(snap.scene, snap.pc);
    },
    [saves, packId, updateURL],
  );

  const jumpToScene = useCallback(
    (name: string) => {
      const scene = name.replace(/\.txt$/i, "");
      setSceneMode(false);
      setSceneFilter("");
      setData(null);
      setStarted(false);
      setEnded(false);
      setPaused(false);
      setChoices(null);
      setResumeScene(scene);
      setResume({ pc: 0, image: "" });
      setReloadKey((k) => k + 1);
      updateURL(scene, 0);
    },
    [updateURL],
  );

  const reloadCurrent = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    setStarted(false);
    setEnded(false);
    setPaused(false);
    setChoices(null);
    const snap = player.snapshot();
    setData(null);
    setResumeScene(player.currentScene);
    setResume({ pc: snap.pc, image: snap.image, stage: snap.stage, flags: snap.flags });
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setSaveMode(null);
        setSceneMode(false);
        setMenuOpen(false);
        return;
      }
      if (saveMode || sceneMode || menuOpen) return;
      if (ev.key === "Enter") {
        ev.preventDefault();
        if (uiHidden) setUiHidden(false);
        else advance();
      } else if (ev.code === "Space") {
        ev.preventDefault();
        setUiHidden((hidden) => !hidden);
      } else if (ev.key === "p" || ev.key === "P") {
        if (started) togglePause();
      } else if (ev.key === "m" || ev.key === "M") {
        setMuted((m) => !m);
      } else if (ev.key === "f" || ev.key === "F") {
        toggleFullscreen();
      } else if ((ev.key === "d" || ev.key === "D") && !(ev.target instanceof HTMLInputElement)) {
        setDebugOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, togglePause, toggleFullscreen, advance, saveMode, sceneMode, menuOpen, uiHidden]);

  const assets = data?.assets ?? EMPTY_ASSETS;
  const scriptCount = Object.keys(assets.text).length;

  return (
    <main className={`shell ${uiHidden ? "ui-hidden" : ""}`}>


      <section className="stage-wrap" ref={stageRef}>
        <div className="screen" onClick={handleStageClick}>
          <canvas ref={canvasRef} width={640} height={480} aria-label="game screen" />

          {started && (
            <div className="dialogue-tools" onClick={(ev) => ev.stopPropagation()}>
              <button className="tool" onClick={togglePause} title="Pause (P)">
                {paused ? "▶" : "❚❚"}
              </button>
              <button className="tool" onClick={() => setSaveMode("save")} title="Save">
                Save
              </button>
              <button className="tool" onClick={() => setSaveMode("load")} disabled={saves.every((s) => !s)} title="Load">
                Load
              </button>
              <button className="tool" onClick={() => setSceneMode(true)} disabled={scriptCount === 0} title="Scenes">
                Scenes
              </button>
              <button className="tool" onClick={() => setMuted((m) => !m)} title="Mute (M)">
                {muted ? "🔇" : "🔊"}
              </button>
              <button className="tool" onClick={toggleFullscreen} title="Fullscreen (F)">
                ⛶
              </button>
              <button className="tool" onClick={() => setMenuOpen(true)} title="Settings">
                ☰
              </button>
            </div>
          )}

          {menuOpen && (
            <div
              className="save-overlay"
              onClick={(ev) => {
                ev.stopPropagation();
                setMenuOpen(false);
              }}
            >
              <div className="save-panel settings-panel" onClick={(ev) => ev.stopPropagation()}>
                <div className="save-head">
                  <strong>Settings</strong>
                  <button onClick={() => setMenuOpen(false)}>✕</button>
                </div>
                <div className="kv settings-kv">
                  <span>scene</span>
                  <b>{currentScene || "—"}</b>
                  <span>command</span>
                  <b>cmd {currentPC}</b>
                  <span>status</span>
                  <b>{status}</b>
                </div>
                <label className="settings-row">
                  <span>pack</span>
                  <select
                    className="pack"
                    value={packId}
                    onChange={(ev) => {
                      setData(null);
                      setStarted(false);
                      setEnded(false);
                      setUiHidden(false);
                      setMenuOpen(false);
                      setPackId(ev.target.value);
                      setResumeScene("");
                      setCurrentScene("");
                      setCurrentPC(0);
                      setResume({ pc: 0, image: "" });
                    }}
                  >
                    {packs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="settings-row">
                  <span>volume</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(volume * 100)}
                    onChange={(ev) => setVolume(Number(ev.target.value) / 100)}
                  />
                </label>
                <label className="settings-row">
                  <span>dialog opacity</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(dialogOpacity * 100)}
                    onChange={(ev) => setDialogOpacity(Number(ev.target.value) / 100)}
                  />
                  <b className="setting-value">{Math.round(dialogOpacity * 100)}%</b>
                </label>
                <div className="settings-actions">
                  <button onClick={() => { setMenuOpen(false); setSaveMode("save"); }}>Save</button>
                  <button onClick={() => { setMenuOpen(false); setSaveMode("load"); }} disabled={saves.every((s) => !s)}>Load</button>
                  <button onClick={() => { setMenuOpen(false); setSceneMode(true); }}>Scenes</button>
                  <button onClick={() => { setMenuOpen(false); setDebugOpen(true); }}>Debug</button>
                  <button onClick={reloadCurrent}>Reload scene</button>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="notice error">
              <p>{error}</p>
            </div>
          )}
          {!error && ended && (
            <div className="notice">
              <p>scene ended</p>
              <button onClick={(ev) => { ev.stopPropagation(); restart(); }}>Replay</button>
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

          {sceneMode && (
            <div
              className="save-overlay"
              onClick={(ev) => {
                ev.stopPropagation();
                setSceneMode(false);
              }}
            >
              <div className="save-panel scene-panel" onClick={(ev) => ev.stopPropagation()}>
                <div className="save-head">
                  <strong>Scenes</strong>
                  <button onClick={() => setSceneMode(false)}>✕</button>
                </div>
                <input
                  className="scene-filter"
                  autoFocus
                  placeholder="filter scripts…"
                  value={sceneFilter}
                  onChange={(ev) => setSceneFilter(ev.target.value)}
                />
                <div className="scene-list">
                  {Object.keys(assets.text)
                    .filter((n) => n.includes(sceneFilter.toLowerCase()))
                    .sort()
                    .map((n) => (
                      <button key={n} className="scene-item" onClick={() => jumpToScene(n)}>
                        {n}
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
        </div>
      </section>

      {debugOpen && (
        <DebugPanel
          getState={() => playerRef.current?.debugState() ?? null}
          log={log}
          status={status}
          onClose={() => setDebugOpen(false)}
          onReload={reloadCurrent}
          onAdvance={advance}
          onCopyLink={() => {
            void navigator.clipboard?.writeText(window.location.href);
          }}
        />
      )}


    </main>
  );
}
