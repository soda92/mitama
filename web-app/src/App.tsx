import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Player,
  type BattleInfo,
  type BattlePolicy,
  type Snapshot,
  type StageSnapshot,
} from "./game/player";
import DebugPanel from "./components/DebugPanel";
import ArchiveManager from "./components/ArchiveManager";
import Navigator from "./components/Navigator";
import BattleScreen from "./components/BattleScreen";
import type { AssetMap, Option, PackInfo, Script } from "./game/types";
import type { BattleCharacter, BattleEncounter } from "./game/battle";

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

interface BattleSession {
  info: BattleInfo;
  encounter: BattleEncounter;
  player: BattleCharacter;
  backgroundUrl?: string;
}

interface BattleFlash {
  info: BattleInfo;
  winner: "win" | "lose";
}

const EMPTY_ASSETS: AssetMap = { game: {}, bgm: {}, se: {}, text: {} };
const LEGACY_SAVE_KEY = "mitama.saves.v1";
const ARCHIVE_KEY = "mitama.archives.v1";

type ArchiveMap = Record<string, Snapshot>;

function readArchives(): ArchiveMap {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    if (raw) return JSON.parse(raw) as ArchiveMap;
  } catch {
    // fall through to legacy migration
  }
  try {
    const raw = localStorage.getItem(LEGACY_SAVE_KEY);
    if (!raw) return {};
    const old = JSON.parse(raw) as (Snapshot | null)[];
    const out: ArchiveMap = {};
    old.forEach((snap, i) => {
      if (snap) out[String(i + 1)] = snap;
    });
    writeArchives(out);
    return out;
  } catch {
    return {};
  }
}

function writeArchives(archives: ArchiveMap): void {
  try {
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archives));
  } catch {
    // localStorage may be unavailable or full; saves are best-effort.
  }
}

function nextArchiveID(archives: ArchiveMap): string {
  let max = 0;
  for (const id of Object.keys(archives)) {
    const n = Number.parseInt(id, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1);
}

function makeThumbnail(canvas: HTMLCanvasElement | null): string | undefined {
  if (!canvas) return undefined;
  try {
    const t = document.createElement("canvas");
    t.width = 320;
    t.height = 240;
    const g = t.getContext("2d");
    if (!g) return undefined;
    g.drawImage(canvas, 0, 0, t.width, t.height);
    return t.toDataURL("image/jpeg", 0.6);
  } catch {
    return undefined;
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
  const shellRef = useRef<HTMLElement>(null);
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
  const [archives, setArchives] = useState<ArchiveMap>(readArchives);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [battleSession, setBattleSession] = useState<BattleSession | null>(null);
  const [battleFlash, setBattleFlash] = useState<BattleFlash | null>(null);
  const battleResolveRef = useRef<((result: "win" | "lose") => void) | null>(null);
  const battlePolicyRef = useRef<BattlePolicy>("play");
  const assetsRef = useRef<AssetMap>(EMPTY_ASSETS);
  const [battlePolicy, setBattlePolicy] = useState<BattlePolicy>(() => {
    const raw = localStorage.getItem("mitama.battlePolicy");
    return raw === "win" || raw === "lose" || raw === "random" || raw === "play" ? raw : "play";
  });
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
        battle: (info) => {
          const policy = battlePolicyRef.current;
          if (policy !== "play") {
            const winner =
              policy === "random" ? (Math.random() < 0.5 ? "win" : "lose") : policy;
            setBattleFlash({ info, winner });
            return new Promise<"win" | "lose">((resolve) => {
              window.setTimeout(() => {
                setBattleFlash(null);
                resolve(winner);
              }, 1000);
            });
          }

          return (async () => {
            const leader = /^(oh|os)/i.test(playerRef.current?.currentScene ?? "")
              ? "oboro"
              : "yahiro";
            let player: BattleCharacter = {
              file: `${leader}.chr`,
              name: leader === "oboro" ? "朧" : "八尋",
              skills: [1, 1, 1],
              defaultAction: 0,
              resist: [0, 0, 0],
              survive: 20,
              object: "",
            };
            try {
              if (!info.script) throw new Error("battle script missing");
              const [encRes, charRes] = await Promise.all([
                fetch(
                  `/api/battle?pack=${encodeURIComponent(packId)}&name=${encodeURIComponent(info.script)}`,
                ),
                fetch(
                  `/api/battle/character?pack=${encodeURIComponent(packId)}&name=${leader}`,
                ),
              ]);
              if (!encRes.ok) throw new Error(`battle: HTTP ${encRes.status}`);
              const encounter = (await encRes.json()) as BattleEncounter;
              if (charRes.ok) player = (await charRes.json()) as BattleCharacter;
              const rel = assetsRef.current.game[info.background.toLowerCase()];
              const backgroundUrl = rel
                ? `/media/${encodeURIComponent(packId)}/${rel}`
                : undefined;
              setBattleSession({ info, encounter, player, backgroundUrl });
              return await new Promise<"win" | "lose">((resolve) => {
                battleResolveRef.current = resolve;
              });
            } catch (err) {
              console.error("battle fallback", err);
              setBattleFlash({ info, winner: "win" });
              await new Promise<void>((resolve) => window.setTimeout(resolve, 1000));
              setBattleFlash(null);
              return "win";
            }
          })();
        },
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

  useEffect(() => {
    battlePolicyRef.current = battlePolicy;
    try {
      localStorage.setItem("mitama.battlePolicy", battlePolicy);
    } catch {
      // best-effort setting persistence
    }
  }, [battlePolicy]);

  useEffect(() => {
    assetsRef.current = data?.assets ?? EMPTY_ASSETS;
  }, [data]);

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

  const cancelBattle = useCallback(() => {
    const resolve = battleResolveRef.current;
    battleResolveRef.current = null;
    resolve?.("lose");
    setBattleSession(null);
    setBattleFlash(null);
  }, []);

  const finishBattle = useCallback((result: "win" | "lose") => {
    const resolve = battleResolveRef.current;
    battleResolveRef.current = null;
    setBattleSession(null);
    resolve?.(result);
  }, []);

  const restart = useCallback(() => {
    cancelBattle();
    setData(null);
    setStarted(false);
    setEnded(false);
    setPaused(false);
    setUiHidden(false);
    setResumeScene("");
    setResume({ pc: 0, image: "" });
    setChoices(null);
    setReloadKey((k) => k + 1);
  }, [cancelBattle]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void shellRef.current?.requestFullscreen?.();
  }, []);

  const openArchives = useCallback(() => {
    setNavigatorOpen(false);
    setArchiveOpen(true);
  }, []);

  const openNavigator = useCallback(() => {
    setArchiveOpen(false);
    setNavigatorOpen(true);
  }, []);

  const choose = useCallback((label: string) => {
    setChoices(null);
    playerRef.current?.choose(label);
  }, []);

  const saveCurrent = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    const snap = player.snapshot();
    snap.thumbnail = makeThumbnail(canvasRef.current);
    setArchives((prev) => {
      const id = nextArchiveID(prev);
      const next = { ...prev, [id]: snap };
      writeArchives(next);
      return next;
    });
  }, []);

  const overwriteArchive = useCallback((id: string) => {
    const player = playerRef.current;
    if (!player) return;
    const snap = player.snapshot();
    snap.thumbnail = makeThumbnail(canvasRef.current);
    setArchives((prev) => {
      const old = prev[id];
      if (!old) return prev;
      const next = {
        ...prev,
        [id]: {
          ...snap,
          note: old.note,
          pinned: old.pinned,
          thumbnail: snap.thumbnail ?? old.thumbnail,
        },
      };
      writeArchives(next);
      return next;
    });
  }, []);

  const deleteArchive = useCallback((id: string) => {
    setArchives((prev) => {
      const next = { ...prev };
      delete next[id];
      writeArchives(next);
      return next;
    });
  }, []);

  const updateArchive = useCallback((id: string, patch: { note?: string; pinned?: boolean }) => {
    setArchives((prev) => {
      const old = prev[id];
      if (!old) return prev;
      const next = { ...prev, [id]: { ...old, ...patch } };
      writeArchives(next);
      return next;
    });
  }, []);

  const loadArchive = useCallback(
    (snap: Snapshot) => {
      cancelBattle();
      setArchiveOpen(false);
      setChoices(null);
      setData(null);
      setStarted(false);
      setEnded(false);
      setPaused(false);
      setUiHidden(false);
      setResumeScene(snap.scene);
      setResume({ pc: snap.pc, image: snap.image, stage: snap.stage, flags: snap.flags });
      setPackId(snap.pack);
      setReloadKey((k) => k + 1);
      updateURL(snap.scene, snap.pc);
    },
    [updateURL, cancelBattle],
  );

  const navigateToScene = useCallback(
    (name: string, pc = 0) => {
      cancelBattle();
      const scene = name.replace(/\.txt$/i, "");
      setNavigatorOpen(false);
      setData(null);
      setStarted(false);
      setEnded(false);
      setPaused(false);
      setChoices(null);
      setResumeScene(scene);
      setResume({ pc, image: "" });
      setReloadKey((k) => k + 1);
      updateURL(scene, pc);
    },
    [updateURL, cancelBattle],
  );

  const seekTo = useCallback(
    (pc: number) => {
      const scene = playerRef.current?.currentScene || currentScene;
      if (!scene) return;
      cancelBattle();
      setNavigatorOpen(false);
      setData(null);
      setStarted(false);
      setEnded(false);
      setPaused(false);
      setChoices(null);
      setResumeScene(scene);
      setResume({ pc, image: "" });
      setReloadKey((k) => k + 1);
      updateURL(scene, pc);
    },
    [currentScene, updateURL, cancelBattle],
  );

  const reloadCurrent = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    cancelBattle();
    setStarted(false);
    setEnded(false);
    setPaused(false);
    setChoices(null);
    const snap = player.snapshot();
    setData(null);
    setResumeScene(player.currentScene);
    setResume({ pc: snap.pc, image: snap.image, stage: snap.stage, flags: snap.flags });
    setReloadKey((k) => k + 1);
  }, [cancelBattle]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setArchiveOpen(false);
        setNavigatorOpen(false);
        setMenuOpen(false);
        return;
      }
      if (battleSession) return;
      if (archiveOpen || navigatorOpen) {
        const typing = ev.target instanceof HTMLInputElement;
        if (!typing && (ev.key === "f" || ev.key === "F")) toggleFullscreen();
        else if (!typing && archiveOpen && (ev.key === "n" || ev.key === "N")) openNavigator();
        return;
      }
      if (menuOpen) return;
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
      } else if ((ev.key === "n" || ev.key === "N") && !(ev.target instanceof HTMLInputElement)) {
        openNavigator();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    started,
    togglePause,
    toggleFullscreen,
    advance,
    archiveOpen,
    navigatorOpen,
    battleSession,
    menuOpen,
    uiHidden,
    openArchives,
    openNavigator,
  ]);

  const assets = data?.assets ?? EMPTY_ASSETS;
  const scriptCount = Object.keys(assets.text).length;

  return (
    <main
      ref={shellRef}
      className={`shell ${uiHidden ? "ui-hidden" : ""} ${archiveOpen || navigatorOpen ? "side-open" : ""}`}
      style={{ "--dialog-opacity": dialogOpacity } as CSSProperties}
    >
      <div className="play-area">

      <section className="stage-wrap">
        <div className="screen" onClick={handleStageClick}>
          <canvas ref={canvasRef} width={640} height={480} aria-label="game screen" />

          {started && (
            <div className="dialogue-tools" onClick={(ev) => ev.stopPropagation()}>
              <button className="tool" onClick={togglePause} title="Pause (P)">
                {paused ? "▶" : "❚❚"}
              </button>
              <button
                className={`tool ${archiveOpen ? "on" : ""}`}
                onClick={() => (archiveOpen ? setArchiveOpen(false) : openArchives())}
                title="Archives"
              >
                Archives
              </button>
              <button
                className={`tool ${navigatorOpen ? "on" : ""}`}
                onClick={() => (navigatorOpen ? setNavigatorOpen(false) : openNavigator())}
                disabled={scriptCount === 0}
                title="Navigator (N)"
              >
                Navigate
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
                      cancelBattle();
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
                <label className="settings-row">
                  <span>battle</span>
                  <select
                    className="pack"
                    value={battlePolicy}
                    onChange={(ev) => setBattlePolicy(ev.target.value as BattlePolicy)}
                  >
                    <option value="play">play battle</option>
                    <option value="win">auto-win</option>
                    <option value="lose">auto-lose</option>
                    <option value="random">random</option>
                  </select>
                </label>
                <div className="settings-actions">
                  <button onClick={() => { setMenuOpen(false); openArchives(); }}>Archives</button>
                  <button onClick={() => { setMenuOpen(false); openNavigator(); }}>Navigate</button>
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

          {battleFlash && (
            <div className="battle-overlay">
              <div className={`battle-card ${battleFlash.winner}`}>
                <strong>BATTLE</strong>
                <span>{battleFlash.info.script || battleFlash.info.background}</span>
                <b>{battleFlash.winner === "win" ? "Victory" : "Defeat"}</b>
                <small>auto-resolved</small>
              </div>
            </div>
          )}

          {battleSession && (
            <BattleScreen
              encounter={battleSession.encounter}
              player={battleSession.player}
              party={battleSession.info.party}
              backgroundUrl={battleSession.backgroundUrl}
              onFinish={finishBattle}
            />
          )}

          {loading && (
            <div className="loading">
              <span /> loading…
            </div>
          )}
        </div>
      </section>

      {archiveOpen && (
        <ArchiveManager
          slots={archives}
          canSave={started && !!playerRef.current}
          currentScene={currentScene}
          currentPC={currentPC}
          onClose={() => setArchiveOpen(false)}
          onSaveNew={saveCurrent}
          onOverwrite={overwriteArchive}
          onLoad={loadArchive}
          onDelete={deleteArchive}
          onUpdate={updateArchive}
        />
      )}

      {navigatorOpen && (
        <Navigator
          scene={currentScene}
          pc={currentPC}
          commands={playerRef.current?.currentCommands ?? data?.script.commands ?? []}
          scenes={Object.keys(assets.text)}
          onClose={() => setNavigatorOpen(false)}
          onSeek={seekTo}
          onSelectScene={(name) => navigateToScene(name, 0)}
        />
      )}
      </div>

      {debugOpen && (
        <DebugPanel
          getState={() => playerRef.current?.debugState() ?? null}
          log={log}
          status={status}
          battlePolicy={battlePolicy}
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
