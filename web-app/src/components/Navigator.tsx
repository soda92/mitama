import { useEffect, useMemo, useRef, useState } from "react";
import { speakerDisplayName, type Command } from "../game/types";

interface NavigatorProps {
  packId: string;
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

interface SceneMeta {
  name: string;
  title: string;
  chapter: string;
}

interface SceneGroup {
  key: string;
  route: string;
  title: string;
  order: number;
  scenes: SceneMeta[];
}

const sceneMetaCache = new Map<string, SceneMeta[]>();

const ROUTE_ORDER = ["八尋編", "紅羽編", "瑞希編", "朧編", "紫芳編", "阿佐弥編", "その他"];

function routeLabel(scene: string): string {
  const base = scene.replace(/^e(?=[a-z])/i, "");
  const m = base.match(/^([a-z]+)/i);
  const prefix = (m?.[1] ?? "").toLowerCase();
  switch (prefix) {
    case "yr":
    case "ye":
      return "八尋編";
    case "yk":
      return "紅羽編";
    case "ym":
      return "瑞希編";
    case "os":
    case "oe":
      return "朧編";
    case "oh":
      return "紫芳編";
    case "oa":
      return "阿佐弥編";
    default:
      return prefix ? prefix.toUpperCase() : "その他";
  }
}

function sceneNumber(scene: string): number {
  const base = scene.replace(/^e(?=[a-z])/i, "");
  const m = base.match(/^([a-z]+)(\d+)/i);
  return m ? Number(m[2]) : 999;
}

function isSceneName(name: string): boolean {
  return /^e?[a-z]{2,}\d/i.test(name);
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

function destinationName(destination?: BranchDestination): string {
  if (!destination) return "unknown target";
  switch (destination.kind) {
    case "scene":
      return destination.scene;
    case "choice":
      return `choice at pc ${destination.index}`;
    case "battle":
      return `battle${destination.label ? ` ${destination.label}` : ""}`;
    case "end":
      return "scene end";
    default:
      return "target not found";
  }
}

function destinationLabel(destination?: BranchDestination): string {
  return `→ ${destinationName(destination)}`;
}

export default function Navigator({
  packId,
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
  const [pending, setPending] = useState<{ point: BranchPointView; option: BranchOptionView } | null>(null);
  const [sceneMeta, setSceneMeta] = useState<SceneMeta[] | null>(() => sceneMetaCache.get(packId) ?? null);
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

  useEffect(() => {
    const cached = sceneMetaCache.get(packId);
    if (cached) {
      setSceneMeta(cached);
      return;
    }
    let cancelled = false;
    fetch(`/api/gallery?pack=${encodeURIComponent(packId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`scenes: HTTP ${response.status}`);
        const body = (await response.json()) as { scenes?: SceneMeta[] };
        return body.scenes ?? [];
      })
      .then((items) => {
        if (cancelled) return;
        sceneMetaCache.set(packId, items);
        setSceneMeta(items);
      })
      .catch(() => {
        if (!cancelled) setSceneMeta([]);
      });
    return () => {
      cancelled = true;
    };
  }, [packId]);

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

  const groups = useMemo<SceneGroup[]>(() => {
    const source: SceneMeta[] =
      sceneMeta && sceneMeta.length > 0
        ? sceneMeta
        : scenes.map((name) => ({
            name,
            title: name,
            chapter: chapterOf(name),
          }));
    const visible = source.filter((item) => isSceneName(item.name));
    const titleByRouteNumber = new Map<string, string>();
    for (const item of visible) {
      if (item.title && item.title !== item.name) {
        titleByRouteNumber.set(`${routeLabel(item.name)}|${sceneNumber(item.name)}`, item.title);
      }
    }
    const map = new Map<string, SceneGroup>();
    const q = query.trim().toLowerCase();
    for (const item of visible) {
      const route = routeLabel(item.name);
      const inferred = titleByRouteNumber.get(`${route}|${sceneNumber(item.name)}`);
      const rawTitle =
        item.title && item.title !== item.name
          ? item.title
          : inferred || chapterOf(item.name);
      const title = rawTitle || chapterOf(item.name);
      if (
        q &&
        !item.name.toLowerCase().includes(q) &&
        !title.toLowerCase().includes(q) &&
        !route.toLowerCase().includes(q)
      ) {
        continue;
      }
      const key = `${route}\u0000${title}`;
      let group = map.get(key);
      if (!group) {
        group = { key, route, title, order: 999, scenes: [] };
        map.set(key, group);
      }
      group.order = Math.min(group.order, sceneNumber(item.name));
      group.scenes.push(item);
    }
    return [...map.values()]
      .map((group) => ({ ...group, scenes: group.scenes.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => {
        const routeDelta = ROUTE_ORDER.indexOf(a.route) - ROUTE_ORDER.indexOf(b.route);
        if (routeDelta !== 0) return routeDelta;
        if (a.order !== b.order) return a.order - b.order;
        return a.title.localeCompare(b.title);
      });
  }, [scenes, sceneMeta, query]);

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
            <p className="navigator-note">
              Grouped by the in-script chapter title (<code>STS</code>), then by
              route. Scene ids are shown under each chapter.
            </p>
            {groups.map((group) => (
              <section key={group.key}>
                <h4>
                  <span>{group.route}</span>
                  {group.title}
                </h4>
                <div className="navigator-scene-grid">
                  {group.scenes.map((item) => (
                    <button
                      key={item.name}
                      ref={item.name === scene ? currentSceneRef : undefined}
                      className={item.name === scene ? "on" : ""}
                      onClick={() => onSelectScene(item.name)}
                      title={item.name}
                    >
                      {item.name}
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
            Choices in <b>{scene}</b>. Select an option to preview its target,
            then confirm with <b>Jump</b>. A <code>LOD</code> target switches to
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
                          className={`branch-option ${pending?.option === option && pending?.point === point ? "selected" : ""}`}
                          disabled={!clickable}
                          title={option.textEn}
                          onClick={() => setPending({ point, option })}
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
          {pending && (
            <div className="branch-confirm">
              <div>
                <strong>Jump to {destinationName(pending.option.destination)}?</strong>
                <span>{pending.option.text}</span>
              </div>
              <div className="branch-confirm-actions">
                <button
                  className="primary"
                  onClick={() => {
                    openDestination(pending.option.destination);
                    setPending(null);
                  }}
                >
                  Jump
                </button>
                <button onClick={() => setPending(null)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
