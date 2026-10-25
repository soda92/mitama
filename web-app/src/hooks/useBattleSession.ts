import { useCallback, useRef, useState } from "react";
import type { BattleInfo } from "../game/player";
import type { BattleCharacter, BattleEncounter } from "../game/battle";
import type { AssetMap } from "../game/types";
import type { BattlePolicy } from "../game/settings";

export interface BattleSession {
  info: BattleInfo;
  encounter: BattleEncounter;
  player: BattleCharacter;
  backgroundUrl?: string;
  bgmUrl?: string;
  winBgmUrl?: string;
  loseBgmUrl?: string;
}

interface BattleFlash {
  info: BattleInfo;
  winner: "win" | "lose";
}

interface Options {
  policy: BattlePolicy;
  packId: string;
  assets: AssetMap;
  /** Resolve the current script scene at battle start (LOD may have changed it). */
  currentScene: () => string;
}

export function useBattleSession(options: Options) {
  const latest = useRef(options);
  latest.current = options;

  const [session, setSession] = useState<BattleSession | null>(null);
  const [flash, setFlash] = useState<BattleFlash | null>(null);
  const resolver = useRef<((result: "win" | "lose") => void) | null>(null);

  const runBattle = useCallback((info: BattleInfo): Promise<"win" | "lose"> => {
    const { policy, packId, assets, currentScene } = latest.current;

    if (policy !== "play") {
      const winner =
        policy === "random" ? (Math.random() < 0.5 ? "win" : "lose") : policy;
      setFlash({ info, winner });
      return new Promise((resolve) => {
        window.setTimeout(() => {
          setFlash(null);
          resolve(winner);
        }, 1000);
      });
    }

    return (async () => {
      const leader = /^(oh|os)/i.test(currentScene()) ? "oboro" : "yahiro";
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
        const key = info.background.toLowerCase();
        const rel = assets.hd?.[key] ?? assets.game[key];
        const backgroundUrl = rel
          ? `/media/${encodeURIComponent(packId)}/${rel}`
          : undefined;
        const bgmKey = encounter.party.bgm.replace(/\.xa$/i, "").toLowerCase();
        const bgmRel = assets.bgm[bgmKey];
        const audioUrl = (rel: string | undefined) =>
          rel
            ? `/api/audio?pack=${encodeURIComponent(packId)}&file=${encodeURIComponent(rel)}`
            : undefined;
        const bgmUrl = audioUrl(bgmRel);
        const winKey = encounter.party.winBgm?.replace(/\.xa$/i, "").toLowerCase() ?? "";
        const loseKey = encounter.party.loseBgm?.replace(/\.xa$/i, "").toLowerCase() ?? "";
        const winBgmUrl = audioUrl(assets.bgm[winKey] ?? assets.se[winKey]);
        const loseBgmUrl = audioUrl(assets.bgm[loseKey] ?? assets.se[loseKey]);
        setSession({ info, encounter, player, backgroundUrl, bgmUrl, winBgmUrl, loseBgmUrl });
        return await new Promise<"win" | "lose">((resolve) => {
          resolver.current = resolve;
        });
      } catch (err) {
        console.error("battle fallback", err);
        setFlash({ info, winner: "win" });
        await new Promise<void>((resolve) => window.setTimeout(resolve, 1000));
        setFlash(null);
        return "win";
      }
    })();
  }, []);

  const cancelBattle = useCallback(() => {
    const resolve = resolver.current;
    resolver.current = null;
    resolve?.("lose");
    setSession(null);
    setFlash(null);
  }, []);

  const finishBattle = useCallback((result: "win" | "lose") => {
    const resolve = resolver.current;
    resolver.current = null;
    setSession(null);
    resolve?.(result);
  }, []);

  return {
    battleSession: session,
    battleFlash: flash,
    runBattle,
    cancelBattle,
    finishBattle,
  };
}
