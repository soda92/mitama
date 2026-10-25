import { useEffect, useMemo, useRef, useState } from "react";
import { speakerDisplayName, type Command } from "../game/types";

interface NavigatorProps {
  scene: string;
  pc: number;
  commands: Command[];
  scenes: string[];
  onClose: () => void;
  onSeek: (pc: number) => void;
  onSelectScene: (scene: string) => void;
}

function chapterOf(scene?: string): string {
  if (!scene) return "Other";
  const m = scene.match(/^([a-z]+)(\d+)/i);
  return m ? `${m[1].toUpperCase()} ${m[2]}` : scene;
}

function commandLabel(c: Command): string {
  if (c.label) return `▸ ${c.label}`;
  if (c.cmd === "TEXT") {
    const speaker = speakerDisplayName(c.speaker);
    return `${speaker ? `${speaker}「` : "「"}${(c.message ?? "").split("\n")[0].slice(0, 42)}`;
  }
  return `${c.cmd ?? "?"}${c.args?.length ? ` ${c.args.join(" ")}` : ""}`;
}

export default function Navigator({
  scene,
  pc,
  commands,
  scenes,
  onClose,
  onSeek,
  onSelectScene,
}: NavigatorProps) {
  const [tab, setTab] = useState<"page" | "chapters">("page");
  const [target, setTarget] = useState(pc);
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLButtonElement>(null);
  const currentSceneRef = useRef<HTMLButtonElement>(null);
  const max = Math.max(0, commands.length - 1);

  useEffect(() => {
    setTarget(Math.min(pc, max));
  }, [pc, max]);

  useEffect(() => {
    if (tab !== "page") return;
    currentRef.current?.scrollIntoView({ block: "center" });
  }, [tab, target]);

  useEffect(() => {
    if (tab !== "chapters") return;
    currentSceneRef.current?.scrollIntoView({ block: "center" });
  }, [tab, scene]);

  const groups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const name of scenes) {
      const ch = chapterOf(name);
      const arr = map.get(ch) ?? [];
      arr.push(name);
      map.set(ch, arr);
    }
    const q = query.trim().toLowerCase();
    return [...map.entries()]
      .map(
        ([chapter, list]) =>
          [
            chapter,
            list
              .filter((name) => !q || name.toLowerCase().includes(q) || chapter.toLowerCase().includes(q))
              .sort(),
          ] as const,
      )
      .filter(([, list]) => list.length > 0);
  }, [scenes, query]);

  const clamp = (v: number) => Math.max(0, Math.min(max, v));
  const jump = (v: number) => {
    const p = clamp(v);
    setTarget(p);
    onSeek(p);
  };
  const step = (delta: number) => jump(target + delta);

  return (
    <aside className="side-window navigator-window">
      <header className="archive-head navigator-head">
        <div className="side-head-top">
          <strong>Navigator</strong>
          <span>
            {scene}:{pc}
          </span>
          <button className="side-close" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <nav className="navigator-tabs">
          <button className={tab === "page" ? "on" : ""} onClick={() => setTab("page")}>
            Page
          </button>
          <button className={tab === "chapters" ? "on" : ""} onClick={() => setTab("chapters")}>
            Chapters
          </button>
        </nav>
      </header>

      {tab === "page" ? (
        <div className="navigator-page">
          <div className="navigator-position">
            <input
              type="number"
              min={0}
              max={max}
              value={target}
              onChange={(ev) => setTarget(clamp(Number.parseInt(ev.target.value || "0", 10) || 0))}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") jump(target);
              }}
            />
            <span>/ {max}</span>
            <button onClick={() => jump(target)}>Jump</button>
          </div>
          <input
            className="navigator-range"
            type="range"
            min={0}
            max={max}
            value={target}
            onChange={(ev) => setTarget(Number.parseInt(ev.target.value, 10))}
            onPointerUp={(ev) => jump(Number.parseInt(ev.currentTarget.value, 10))}
            onKeyUp={(ev) => {
              if (ev.key.startsWith("Arrow")) jump(Number.parseInt(ev.currentTarget.value, 10));
            }}
          />
          <div className="navigator-steps">
            <button onClick={() => step(-100)}>-100</button>
            <button onClick={() => step(-10)}>-10</button>
            <button onClick={() => step(-1)}>-1</button>
            <button onClick={() => step(1)}>+1</button>
            <button onClick={() => step(10)}>+10</button>
            <button onClick={() => step(100)}>+100</button>
          </div>

          <div className="navigator-list" ref={listRef}>
            {commands.map((c, index) => (
              <button
                key={index}
                ref={index === target ? currentRef : undefined}
                className={`navigator-line ${index === target ? "cur" : ""}`}
                onClick={() => jump(index)}
              >
                <span className="navigator-ptr">{index}</span>
                <span>{commandLabel(c)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="navigator-chapters">
          <input
            className="archive-search"
            autoFocus
            placeholder="filter chapters / scenes…"
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
          />
          <div className="navigator-chapter-list">
            {groups.map(([chapter, list]) => (
              <section key={chapter}>
                <h4>{chapter}</h4>
                <div className="navigator-scene-grid">
                  {list.map((name) => (
                    <button
                      key={name}
                      ref={name === scene ? currentSceneRef : undefined}
                      className={name === scene ? "on" : ""}
                      onClick={() => onSelectScene(name)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </aside>
  );

}
