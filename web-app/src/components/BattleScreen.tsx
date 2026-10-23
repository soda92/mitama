import { useEffect, useMemo, useRef, useState } from "react";
import type { BattleCharacter, BattleEncounter } from "../game/battle";

interface BattleScreenProps {
  encounter: BattleEncounter;
  player: BattleCharacter;
  party: string[];
  backgroundUrl?: string;
  onFinish: (result: "win" | "lose") => void;
}

type Phase = "select" | "busy" | "done";
type Action = "ken" | "zyutu" | "uke";

const rand = (n: number) => Math.floor(Math.random() * n);

export default function BattleScreen({
  encounter,
  player,
  party,
  backgroundUrl,
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
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

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
    let damage = 0;
    if (action === "ken") damage = 30 + player.skills[0] * 8 + rand(9);
    else if (action === "zyutu") damage = 42 + player.skills[1] * 8 + rand(11);
    else damage = 0;

    const nextEnemyHp = Math.max(0, enemyHp - damage);
    setEnemyHp(nextEnemyHp);
    if (defending) pushLog(`${playerLabel}は身構えた`);
    else pushLog(`${playerLabel}の${action === "ken" ? "剣" : "術"} → ${damage} ダメージ`);

    if (nextEnemyHp <= 0) {
      timer.current = window.setTimeout(() => finish("win"), 500);
      return;
    }

    timer.current = window.setTimeout(() => {
      const attacker = encounter.characters[rand(Math.max(1, encounter.characters.length))];
      const enemyName = attacker?.name || enemyNames[0];
      let incoming = 16 + enemySkill * 3 + rand(9);
      if (defending) incoming = Math.max(1, Math.round(incoming * 0.45));
      const nextPlayerHp = Math.max(0, playerHp - incoming);
      setPlayerHp(nextPlayerHp);
      pushLog(`${enemyName}の攻撃 → ${incoming} ダメージ`);
      setTurn((n) => n + 1);
      if (nextPlayerHp <= 0) {
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
