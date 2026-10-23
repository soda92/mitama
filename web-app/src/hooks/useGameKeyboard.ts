import { useEffect, useRef } from "react";
import { handleGameKey, type GameKeyboardContext } from "../game/keyboard";

/** Keep the latest callbacks in a ref so the listener can be mounted once. */
export function useGameKeyboard(context: GameKeyboardContext): void {
  const latest = useRef(context);
  latest.current = context;

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => handleGameKey(ev, latest.current);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
