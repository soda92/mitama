import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BattleCharacter,
  BattleEncounter,
  BattleMotionEvent,
  BattleSpecial,
} from "../game/battle";
import { clearBlackBackground } from "../game/chroma";

interface BattleScreenProps {
  encounter: BattleEncounter;
  player: BattleCharacter;
  party: string[];
  backgroundUrl?: string;
  bgmUrl?: string;
  bgmVolume: number;
  seVolume: number;
  packId: string;
  muted: boolean;
  onFinish: (result: "win" | "lose") => void;
}

function MotionActor({
  character,
  motion,
  onDone,
  onEvent,
}: {
  character: BattleCharacter;
  motion?: number;
  onDone?: () => void;
  onEvent?: (event: BattleMotionEvent) => void;
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
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setStep(0);
    doneRef.current = false;
  }, [clip, isAction]);

  useEffect(() => {
    if (!clip) return;
    for (const event of clip.events ?? []) {
      if (event.at === step) onEventRef.current?.(event);
    }
  }, [clip, step]);

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

interface EnemyAction {
  type: number;
  motion: number;
  multiplier: number;
  special?: BattleSpecial;
}

function conditionMatches(move: BattleSpecial, selfAction: number, otherAction: number): boolean {
  return (
    (move.conditions[0] === 0 || move.conditions[0] === selfAction) &&
    (move.conditions[1] === 0 || move.conditions[1] === otherAction)
  );
}

function chooseEnemyAction(character: BattleCharacter, playerAction: number): EnemyAction {
  const rows = (character.actionRates ?? []).filter((row) => row[3] > 0);
  let type = character.defaultAction;
  if (rows.length > 0) {
    const total = rows.reduce((sum, row) => sum + row[3], 0);
    let roll = Math.random() * total;
    for (const row of rows) {
      roll -= row[3];
      if (roll <= 0) {
        type = row[0];
        break;
      }
    }
  }
  const special = character.specials?.find(
    (move) =>
      move.attackType === type &&
      conditionMatches(move, type, playerAction) &&
      Math.random() * 100 < move.chance,
  );
  return {
    type,
    motion: special?.motion ?? (type === 2 ? 9 : type === 1 ? 8 : 7),
    multiplier: special ? 1 + special.multiplier * 0.5 : 1,
    special,
  };
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
  seVolume,
  packId,
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
  const lastPlayerAction = useRef(0);
  const lastEnemyAction = useRef(0);
  const timer = useRef<number | null>(null);
  const flashTimer = useRef<number | null>(null);
  const liveSe = useRef(new Set<HTMLAudioElement>());
  const [flash, setFlash] = useState<"white" | "red" | "black" | null>(null);
  const bgm = useRef<HTMLAudioElement | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
      for (const audio of liveSe.current) audio.pause();
      liveSe.current.clear();
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

  const handleMotionEvent = (event: BattleMotionEvent) => {
    if (event.kind === "se" || event.kind === "c_se" || event.kind === "se_attack") {
      const name = (event.value ?? "").split(",").pop()?.trim();
      if (!name) return;
      const audio = new Audio(
        `/api/audio?pack=${encodeURIComponent(packId)}&file=${encodeURIComponent(`se/${name}.xa`)}`,
      );
      audio.volume = muted ? 0 : seVolume;
      liveSe.current.add(audio);
      const done = () => liveSe.current.delete(audio);
      audio.addEventListener("ended", done, { once: true });
      audio.addEventListener("error", done, { once: true });
      void audio.play().catch(done);
      return;
    }
    if (event.kind === "flash") {
      const rgb = (event.value ?? "").split(",").slice(0, 3).map(Number);
      const [r = 0, g = 0, b = 0] = rgb;
      setFlash(r + g + b > 300 ? "white" : r > g + b ? "red" : "black");
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(null), 140);
    }
  };

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
    const actionType = action === "ken" ? 0 : action === "zyutu" ? 1 : 2;
    const special = player.specials?.find(
      (move) =>
        move.attackType === actionType &&
        conditionMatches(move, actionType, lastEnemyAction.current) &&
        Math.random() * 100 < move.chance,
    );
    lastPlayerAction.current = actionType;
    setPlayerMotion(special?.motion ?? (action === "ken" ? 7 : action === "zyutu" ? 8 : 9));
    let damage = 0;
    if (action === "ken") damage = 30 + player.skills[0] * 8 + rand(9);
    else if (action === "zyutu") damage = 42 + player.skills[1] * 8 + rand(11);
    else damage = 0;
    if (special) damage = Math.round(damage * (1 + special.multiplier * 0.5));

    const nextEnemyHp = Math.max(0, enemyHp - damage);
    setEnemyHp(nextEnemyHp);
    if (defending) pushLog(`${playerLabel}は身構えた`);
    else if (special) pushLog(`${playerLabel}の${special.name ?? "特殊技"} → ${damage} ダメージ`);
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
      const chosen = attacker
        ? chooseEnemyAction(attacker, lastPlayerAction.current)
        : { type: 0, motion: 7, multiplier: 1 };
      lastEnemyAction.current = chosen.type;
      setEnemyMotions({ [attackerIndex]: chosen.motion });

      if (chosen.type === 2) {
        pushLog(`${enemyName}は身構えた`);
        setTurn((n) => n + 1);
        setPhase("select");
        return;
      }
      setPlayerMotion(13);

      const skill = attacker ? Math.max(...attacker.skills) : enemySkill;
      let incoming = 16 + skill * 3 + rand(9);
      incoming = Math.round(incoming * chosen.multiplier);
      if (defending) incoming = Math.max(1, Math.round(incoming * 0.45));
      const nextPlayerHp = Math.max(0, playerHp - incoming);
      setPlayerHp(nextPlayerHp);
      pushLog(
        chosen.special
          ? `${enemyName}の${chosen.special.name ?? "特殊技"} → ${incoming} ダメージ`
          : `${enemyName}の攻撃 → ${incoming} ダメージ`,
      );
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
      {flash && <div className={`battle-flash ${flash}`} />}

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
              onEvent={handleMotionEvent}
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
                onEvent={handleMotionEvent}
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
