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

type BranchDestination =
  | { kind: "scene"; scene: string; notes: string[] }
  | { kind: "choice"; index: number; notes: string[] }
  | { kind: "battle"; label: string; notes: string[] }
  | { kind: "end"; notes: string[] }
  | { kind: "unknown"; notes: string[] };

interface BranchOptionView {
  text: string;
  textEn?: string;
  label: string;
  destination?: BranchDestination;
}

interface BranchPointView {
  index: number;
  line: number;
  prompt?: string;
  options: BranchOptionView[];
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

function scanDestination(
  index: number,
  commands: Command[],
  labels: Record<string, number>,
  depth = 0,
  notes: string[] = [],
): BranchDestination {
  if (depth > 8) return { kind: "unknown", notes: [...new Set(notes)] };
  const limit = Math.min(commands.length, index + 900);
  for (let i = index; i < limit; i++) {
    const c = commands[i];
    if (c.cmd === "LOD" && c.args?.[0]) {
      return { kind: "scene", scene: c.args[0], notes: [...new Set(notes)] };
    }
    if (c.cmd === "SLT" || c.cmd === "MSLT") {
      return { kind: "choice", index: i, notes: [...new Set(notes)] };
    }
    if (c.cmd === "JMP" && c.args?.[0]) {
      const target = labels[c.args[0]];
      if (target !== undefined && target !== i) {
        return scanDestination(target, commands, labels, depth + 1, notes);
      }
      return { kind: "unknown", notes: [...new Set(notes)] };
    }
    if (c.cmd === "BATTLE") {
      return {
        kind: "battle",
        label: [c.args?.[0], c.args?.[1]].filter(Boolean).join(" "),
        notes: [...new Set(notes)],
      };
    }
    if (c.cmd === "SEND" || c.cmd === "SHAEND" || c.cmd === "END") {
      return { kind: "end", notes: [...new Set(notes)] };
    }
    if (c.cmd === "PARTY" && c.args?.length) {
      notes.push(`PARTY ${c.args.join(" ")}`);
    }
    if (c.cmd === "FLG" && c.args?.length) {
      notes.push(`FLG ${c.args.join(" ")}`);
    }
  }
  return { kind: "unknown", notes: [...new Set(notes)] };
}

function promptBefore(index: number, commands: Command[]): string | undefined {
  let fallback = "";
  for (let i = index - 1; i >= 0 && i > index - 14; i--) {
    const c = commands[i];
    if (c.cmd !== "TEXT" || !c.message) continue;
    const text = c.message.split("\n").filter(Boolean).slice(0, 2).join(" / ");
    if (c.speaker && c.speaker !== "説") return text;
    if (!fallback) fallback = text;
  }
  return fallback || undefined;
}

function destinationLabel(destination?: BranchDestination): string {
  if (!destination) return "unknown target";
  switch (destination.kind) {
    case "scene":
      return `→ ${destination.scene}`;
    case "choice":
      return `→ choice at pc ${destination.index}`;
    case "battle":
      return `→ battle${destination.label ? ` ${destination.label}` : ""}`;
    case "end":
      return "→ scene end";
    default:
      return "→ target not found";
  }
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
  const [tab, setTab] = useState<"page" | "chapters" | "branches">("page");
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

  const labels = useMemo(() => {
    const map: Record<string, number> = {};
    commands.forEach((c, index) => {
      if (c.label) map[c.label] = index;
    });
    return map;
  }, [commands]);

  const branches = useMemo<BranchPointView[]>(() => {
    return commands.flatMap((c, index) => {
      if (c.cmd !== "SLT" && c.cmd !== "MSLT") return [];
      return [
        {
          index,
          line: c.line,
          prompt: promptBefore(index, commands),
          options: (c.options ?? []).map((option) => {
            const target = labels[option.label];
            return {
              text: option.text,
              textEn: option.textEn,
              label: option.label,
              destination:
                target === undefined
                  ? { kind: "unknown", notes: [] }
                  : scanDestination(target, commands, labels),
            };
          }),
        },
      ];
    });
  }, [commands, labels]);

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
  const openDestination = (destination?: BranchDestination) => {
    if (!destination) return;
    if (destination.kind === "scene") onSelectScene(destination.scene);
    else if (destination.kind === "choice") onSeek(destination.index);
  };

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
          <button className={tab === "branches" ? "on" : ""} onClick={() => setTab("branches")}>
            Branches
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
      ) : tab === "chapters" ? (
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
      ) : (
        <div className="navigator-branches">
          <p className="navigator-note">
            Choices in <b>{scene}</b>. A <code>LOD</code> target switches to
            another scene / route; “choice” targets stay in this scene.
          </p>
          {branches.length === 0 ? (
            <p className="archive-empty">No choices in this scene.</p>
          ) : (
            <div className="branch-list">
              {branches.map((point) => (
                <section
                  key={point.index}
                  className={`branch-point ${pc >= point.index && pc <= point.index + 3 ? "cur" : ""}`}
                >
                  <header>
                    <button className="branch-pc" onClick={() => jump(point.index)}>
                      pc {point.index}
                    </button>
                    <span>line {point.line}</span>
                  </header>
                  {point.prompt && <p className="branch-prompt">{point.prompt}</p>}
                  <div className="branch-options">
                    {point.options.map((option, i) => {
                      const destination = option.destination;
                      const clickable =
                        destination?.kind === "scene" || destination?.kind === "choice";
                      return (
                        <button
                          key={`${option.label}-${i}`}
                          className="branch-option"
                          disabled={!clickable}
                          title={option.textEn}
                          onClick={() => openDestination(destination)}
                        >
                          <span className="branch-choice">
                            {option.text}
                            <small>{option.label}</small>
                          </span>
                          <span className="branch-target">{destinationLabel(destination)}</span>
                          {destination && destination.notes.length > 0 && (
                            <span className="branch-notes">{destination.notes.join(" · ")}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
