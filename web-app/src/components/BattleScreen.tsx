import { useEffect, useMemo, useRef, useState } from "react";
import type { BattleCharacter, BattleEncounter } from "../game/battle";
import { clearBlackBackground } from "../game/chroma";

interface BattleScreenProps {
  encounter: BattleEncounter;
  player: BattleCharacter;
  party: string[];
  backgroundUrl?: string;
  bgmUrl?: string;
  bgmVolume: number;
  muted: boolean;
  onFinish: (result: "win" | "lose") => void;
}

function MotionActor({
  character,
  motion,
  onDone,
}: {
  character: BattleCharacter;
  motion?: number;
  onDone?: () => void;
}) {
  const clip = useMemo(() => {
    const motions = character.motions ?? [];
    return motions.find((m) => m.index === motion) ?? motions.find((m) => m.index === 1);
  }, [character, motion]);
  const isAction = motion != null;
  const [step, setStep] = useState(0);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setStep(0);
    doneRef.current = false;
  }, [clip, isAction]);

  useEffect(() => {
    if (!clip || clip.steps.length === 0) return;
    if (step >= clip.steps.length) {
      if (!isAction) {
        setStep(0);
      } else if (!doneRef.current) {
        doneRef.current = true;
        onDoneRef.current?.();
      }
      return;
    }
    const wait = Math.max(40, clip.steps[step].wait * 16.67);
    const timer = window.setTimeout(() => setStep((n) => n + 1), wait);
    return () => window.clearTimeout(timer);
  }, [clip, step, isAction]);

  const current = clip?.steps[Math.min(step, clip.steps.length - 1)];
  const frame = current?.frame;
  const bmp = current?.bmp;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bmp || !frame) return;
    canvas.width = frame.w;
    canvas.height = frame.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      ctx.clearRect(0, 0, frame.w, frame.h);
      ctx.drawImage(img, -frame.x, -frame.y);
      clearBlackBackground(ctx, frame.w, frame.h);
    };
    img.src = bmp;
    return () => {
      cancelled = true;
    };
  }, [bmp, frame]);

  if (!frame) return null;
  return (
    <canvas
      ref={canvasRef}
      className="battle-sprite"
      width={frame.w}
      height={frame.h}
      style={{ width: frame.w, height: frame.h }}
    />
  );
}

type Phase = "select" | "busy" | "done";
type Action = "ken" | "zyutu" | "uke";

const rand = (n: number) => Math.floor(Math.random() * n);

export default function BattleScreen({
  encounter,
  player,
  party,
  backgroundUrl,
  bgmUrl,
  bgmVolume,
  muted,
  onFinish,
}: BattleScreenProps) {
  const enemyMaxHp = Math.max(1, encounter.party.maxHp || 416);
  const playerMaxHp = 208 + party.length * 96;
  const [playerHp, setPlayerHp] = useState(playerMaxHp);
  const [enemyHp, setEnemyHp] = useState(enemyMaxHp);
  const [phase, setPhase] = useState<Phase>("select");
  const [result, setResult] = useState<"win" | "lose" | null>(null);
  const [turn, setTurn] = useState(1);
  const [log, setLog] = useState<string[]>(["戦闘開始"]);
  const [playerMotion, setPlayerMotion] = useState<number | undefined>();
  const [enemyMotions, setEnemyMotions] = useState<Record<number, number>>({});
  const timer = useRef<number | null>(null);
  const bgm = useRef<HTMLAudioElement | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  useEffect(() => {
    if (!bgmUrl) return;
    const audio = new Audio(bgmUrl);
    audio.loop = true;
    audio.volume = muted ? 0 : bgmVolume;
    bgm.current = audio;
    void audio.play().catch(() => undefined);
    return () => {
      audio.pause();
      audio.src = "";
      bgm.current = null;
    };
  }, [bgmUrl]);

  useEffect(() => {
    if (bgm.current) bgm.current.volume = muted ? 0 : bgmVolume;
  }, [bgmVolume, muted]);

  const enemyNames = useMemo(() => {
    const names = encounter.characters.map((c) => c.name).filter(Boolean);
    return names.length > 0 ? names : [encounter.party.name || "Enemy"];
  }, [encounter]);
  const enemyLabel = encounter.party.name || enemyNames.join("・");
  const enemySkill = Math.max(
    1,
    ...encounter.characters.map((c) => Math.max(...c.skills)),
  );
  const playerLabel = player.name || "八尋";

  const pushLog = (line: string) => {
    setLog((prev) => [...prev.slice(-3), line]);
  };

  const finish = (value: "win" | "lose") => {
    setResult(value);
    setPhase("done");
    pushLog(value === "win" ? "勝利" : "敗北");
  };

  const act = (action: Action) => {
    if (phase !== "select") return;
    setPhase("busy");

    const defending = action === "uke";
    setPlayerMotion(action === "ken" ? 7 : action === "zyutu" ? 8 : 9);
    let damage = 0;
    if (action === "ken") damage = 30 + player.skills[0] * 8 + rand(9);
    else if (action === "zyutu") damage = 42 + player.skills[1] * 8 + rand(11);
    else damage = 0;

    const nextEnemyHp = Math.max(0, enemyHp - damage);
    setEnemyHp(nextEnemyHp);
    if (defending) pushLog(`${playerLabel}は身構えた`);
    else pushLog(`${playerLabel}の${action === "ken" ? "剣" : "術"} → ${damage} ダメージ`);
    if (damage > 0) {
      setEnemyMotions({ 0: nextEnemyHp <= 0 ? 15 : 13 });
    }

    if (nextEnemyHp <= 0) {
      timer.current = window.setTimeout(() => finish("win"), 500);
      return;
    }

    timer.current = window.setTimeout(() => {
      const attackerIndex = rand(Math.max(1, encounter.characters.length));
      const attacker = encounter.characters[attackerIndex];
      const enemyName = attacker?.name || enemyNames[0];
      setEnemyMotions({ [attackerIndex]: 7 });
      setPlayerMotion(13);
      let incoming = 16 + enemySkill * 3 + rand(9);
      if (defending) incoming = Math.max(1, Math.round(incoming * 0.45));
      const nextPlayerHp = Math.max(0, playerHp - incoming);
      setPlayerHp(nextPlayerHp);
      pushLog(`${enemyName}の攻撃 → ${incoming} ダメージ`);
      setTurn((n) => n + 1);
      if (nextPlayerHp <= 0) {
        setPlayerMotion(15);
        finish("lose");
      } else {
        setPhase("select");
      }
    }, 560);
  };

  return (
    <div
      className="battle-screen"
      style={backgroundUrl ? { backgroundImage: `url(${backgroundUrl})` } : undefined}
      onClick={(ev) => ev.stopPropagation()}
    >
      <div className="battle-shade" />

      <header className="battle-head">
        <div>
          <span>BATTLE</span>
          <b>{enemyLabel}</b>
        </div>
        <div className="battle-turn">turn {turn}</div>
      </header>

      <div className="battle-field">
        <section className="battle-side player">
          <div className="battle-actors">
            <MotionActor
              character={player}
              motion={playerMotion}
              onDone={() => setPlayerMotion(undefined)}
            />
          </div>
          <h3>{playerLabel}</h3>
          <p>{party.length ? party.join("・") : "単独"}</p>
          <div className="battle-hp">
            <i style={{ width: `${(playerHp / playerMaxHp) * 100}%` }} />
          </div>
          <small>
            HP {playerHp} / {playerMaxHp}
          </small>
        </section>

        <div className="battle-vs">VS</div>

        <section className="battle-side enemy">
          <div className="battle-actors">
            {encounter.characters.map((character, index) => (
              <MotionActor
                key={`${character.file}-${index}`}
                character={character}
                motion={enemyMotions[index]}
                onDone={() =>
                  setEnemyMotions((prev) => {
                    if (prev[index] === undefined) return prev;
                    const next = { ...prev };
                    delete next[index];
                    return next;
                  })
                }
              />
            ))}
          </div>
          <h3>{enemyLabel}</h3>
          <div className="battle-enemies">
            {enemyNames.map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
          <div className="battle-hp enemy">
            <i style={{ width: `${(enemyHp / enemyMaxHp) * 100}%` }} />
          </div>
          <small>
            HP {enemyHp} / {enemyMaxHp}
          </small>
        </section>
      </div>

      <div className="battle-console">
        <div className="battle-log">
          {log.map((line, i) => (
            <div key={`${i}-${line}`} className={i === log.length - 1 ? "cur" : ""}>
              {line}
            </div>
          ))}
        </div>
        <div className="battle-actions">
          <button disabled={phase !== "select"} onClick={() => act("ken")}>
            剣
          </button>
          <button disabled={phase !== "select"} onClick={() => act("zyutu")}>
            術
          </button>
          <button disabled={phase !== "select"} onClick={() => act("uke")}>
            受
          </button>
        </div>
      </div>

      {result && (
        <div className="battle-result" onClick={(ev) => ev.stopPropagation()}>
          <div className={`battle-result-card ${result}`}>
            <span>{result === "win" ? "VICTORY" : "DEFEAT"}</span>
            <strong>
              {result === "win"
                ? encounter.party.winText || "勝利"
                : encounter.party.loseText || "敗北"}
            </strong>
            <button onClick={() => onFinish(result)}>Continue</button>
          </div>
        </div>
      )}
    </div>
  );
}
