import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { Player, type Snapshot, type StageSnapshot } from "./game/player";
import DebugPanel from "./components/DebugPanel";
import ArchiveManager from "./components/ArchiveManager";
import Navigator from "./components/Navigator";
import BattleScreen from "./components/BattleScreen";
import SettingsPanel from "./components/SettingsPanel";
import DialogueToolbar from "./components/DialogueToolbar";
import { useGameKeyboard } from "./hooks/useGameKeyboard";
import { useBattleSession } from "./hooks/useBattleSession";
import type { AssetMap, Option, PackInfo, Script } from "./game/types";
import {
  readArchives,
  writeArchives,
  nextArchiveID,
  makeThumbnail,
  type ArchiveMap,
} from "./game/archives";
import {
  readSettings,
  writeSettings,
  type BattlePolicy,
} from "./game/settings";

interface GameData {
  script: Script;
  assets: AssetMap;
}

interface ResumePoint {
  pc: number;
  image: string;
  stage?: StageSnapshot;
  flags?: Record<string, number>;
  party?: string[];
  mapMode?: boolean;
}

const EMPTY_ASSETS: AssetMap = { game: {}, bgm: {}, se: {}, text: {} };

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
  const initialSettings = useMemo(readSettings, []);
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
  const [muted, setMuted] = useState(initialSettings.muted);
  const [bgmVolume, setBgmVolume] = useState(initialSettings.bgmVolume);
  const [seVolume, setSeVolume] = useState(initialSettings.seVolume);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("loading");
  const [log, setLog] = useState("ready");
  const [choices, setChoices] = useState<Option[] | null>(null);
  const [archives, setArchives] = useState<ArchiveMap>(readArchives);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [battlePolicy, setBattlePolicy] = useState<BattlePolicy>(initialSettings.battlePolicy);
  const [uiHidden, setUiHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpacity, setDialogOpacity] = useState(initialSettings.dialogOpacity);
  const [currentScene, setCurrentScene] = useState(params.scene);
  const [currentPC, setCurrentPC] = useState(params.pc);
  const [debugOpen, setDebugOpen] = useState(() => new URLSearchParams(window.location.search).has("debug"));

  const {
    battleSession,
    battleFlash,
    runBattle,
    cancelBattle,
    finishBattle,
  } = useBattleSession({
    policy: battlePolicy,
    packId,
    assets: data?.assets ?? EMPTY_ASSETS,
    currentScene: () => playerRef.current?.currentScene ?? "",
  });

  const runBattleWithAudio = useCallback(
    async (info: Parameters<typeof runBattle>[0]) => {
      const player = playerRef.current;
      player?.suspendBgm();
      try {
        return await runBattle(info);
      } finally {
        player?.resumeBgm();
      }
    },
    [runBattle],
  );

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
        battle: runBattleWithAudio,
      },
      packId,
      startScene,
      loadScript,
    );
    playerRef.current = player;
    player.setBgmVolume(bgmVolume);
    player.setSeVolume(seVolume);
    return () => {
      player.stop();
      playerRef.current = null;
    };
    // Volume is applied separately below; it must not recreate the player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, packId, startScene, loadScript, updateURL, runBattleWithAudio]);

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
    playerRef.current?.setBgmVolume(bgmVolume);
  }, [bgmVolume]);

  useEffect(() => {
    playerRef.current?.setSeVolume(seVolume);
  }, [seVolume]);

  useEffect(() => {
    playerRef.current?.setDialogueHidden(uiHidden);
  }, [uiHidden, data]);

  useEffect(() => {
    playerRef.current?.setDialogueOpacity(dialogOpacity);
  }, [dialogOpacity, data]);

  useEffect(() => {
    playerRef.current?.setMuted(muted);
  }, [muted]);

  useEffect(() => {
    writeSettings({ bgmVolume, seVolume, muted, dialogOpacity, battlePolicy });
  }, [bgmVolume, seVolume, muted, dialogOpacity, battlePolicy]);

  useEffect(() => {
    const unlock = () => {
      void playerRef.current?.unlockAudio();
    };
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
  }, []);

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
    player.start(
      resume.pc,
      resume.image,
      resume.flags,
      resume.stage,
      resume.party,
      resume.mapMode,
    );
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
    void playerRef.current?.unlockAudio();
    playerRef.current?.advance();
  }, []);

  const canvasPoint = useCallback((ev: MouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - rect.left) * 640) / rect.width,
      y: ((ev.clientY - rect.top) * 480) / rect.height,
    };
  }, []);

  const handleStageClick = useCallback(
    (ev: MouseEvent<HTMLDivElement>) => {
      if (uiHidden) {
        setUiHidden(false);
        return;
      }
      const point = canvasPoint(ev);
      const player = playerRef.current;
      if (point && player?.hitReplay(point.x, point.y)) {
        player.replayVoice();
        return;
      }
      advance();
    },
    [uiHidden, advance, canvasPoint],
  );

  const handleStageMove = useCallback(
    (ev: MouseEvent<HTMLDivElement>) => {
      const point = canvasPoint(ev);
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.style.cursor =
        point && playerRef.current?.hitReplay(point.x, point.y) ? "pointer" : "default";
    },
    [canvasPoint],
  );

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

  const changePack = useCallback(
    (id: string) => {
      cancelBattle();
      setData(null);
      setStarted(false);
      setEnded(false);
      setUiHidden(false);
      setMenuOpen(false);
      setPackId(id);
      setResumeScene("");
      setCurrentScene("");
      setCurrentPC(0);
      setResume({ pc: 0, image: "" });
    },
    [cancelBattle],
  );

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
      setResume({
        pc: snap.pc,
        image: snap.image,
        stage: snap.stage,
        flags: snap.flags,
        party: snap.party,
        mapMode: snap.mapMode,
      });
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
    setResume({
      pc: snap.pc,
      image: snap.image,
      stage: snap.stage,
      flags: snap.flags,
      party: snap.party,
      mapMode: snap.mapMode,
    });
    setReloadKey((k) => k + 1);
  }, [cancelBattle]);

  useGameKeyboard({
    archiveOpen,
    navigatorOpen,
    battleOpen: !!battleSession,
    menuOpen,
    uiHidden,
    started,
    muted,
    debugOpen,
    advance,
    togglePause,
    toggleFullscreen,
    openNavigator,
    setArchiveOpen,
    setNavigatorOpen,
    setMenuOpen,
    setUiHidden,
    setMuted,
    setDebugOpen,
  });

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
        <div className="screen" onClick={handleStageClick} onMouseMove={handleStageMove}>
          <canvas ref={canvasRef} width={640} height={480} aria-label="game screen" />

          <DialogueToolbar
            started={started}
            paused={paused}
            archiveOpen={archiveOpen}
            navigatorOpen={navigatorOpen}
            scriptCount={scriptCount}
            muted={muted}
            onPause={togglePause}
            onArchives={() => (archiveOpen ? setArchiveOpen(false) : openArchives())}
            onNavigator={() => (navigatorOpen ? setNavigatorOpen(false) : openNavigator())}
            onMute={() => setMuted((m) => !m)}
            onFullscreen={toggleFullscreen}
            onSettings={() => setMenuOpen(true)}
          />

          {menuOpen && (
            <SettingsPanel
              packId={packId}
              packs={packs}
              currentScene={currentScene}
              currentPC={currentPC}
              status={status}
              bgmVolume={bgmVolume}
              seVolume={seVolume}
              dialogOpacity={dialogOpacity}
              battlePolicy={battlePolicy}
              onClose={() => setMenuOpen(false)}
              onPackChange={changePack}
              onBgmVolume={setBgmVolume}
              onSeVolume={setSeVolume}
              onDialogOpacity={setDialogOpacity}
              onBattlePolicy={setBattlePolicy}
              onArchives={() => {
                setMenuOpen(false);
                openArchives();
              }}
              onNavigate={() => {
                setMenuOpen(false);
                openNavigator();
              }}
              onDebug={() => {
                setMenuOpen(false);
                setDebugOpen(true);
              }}
              onReload={reloadCurrent}
            />
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
              bgmUrl={battleSession.bgmUrl}
              winBgmUrl={battleSession.winBgmUrl}
              loseBgmUrl={battleSession.loseBgmUrl}
              bgmVolume={bgmVolume}
              seVolume={seVolume}
              packId={packId}
              muted={muted}
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
