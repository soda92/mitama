import { useMemo, useState } from "react";
import type { Snapshot } from "../game/player";

type Tab = "recent" | "pinned" | "chapters";

interface ArchiveManagerProps {
  slots: Record<string, Snapshot>;
  canSave: boolean;
  currentScene: string;
  currentPC: number;
  onClose: () => void;
  onSaveNew: () => void;
  onOverwrite: (id: string) => void;
  onLoad: (snap: Snapshot) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, patch: { note?: string; pinned?: boolean }) => void;
}

function chapterOf(scene?: string): string {
  if (!scene) return "Other";
  const m = scene.match(/^([a-z]+)(\d+)/i);
  return m ? `${m[1].toUpperCase()} ${m[2]}` : scene;
}

function when(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "";
  }
}

export default function ArchiveManager({
  slots,
  canSave,
  currentScene,
  currentPC,
  onClose,
  onSaveNew,
  onOverwrite,
  onLoad,
  onDelete,
  onUpdate,
}: ArchiveManagerProps) {
  const [tab, setTab] = useState<Tab>("recent");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.entries(slots)
      .filter(([, s]) => s)
      .filter(([id, s]) => {
        if (!q) return true;
        const hay = [
          id,
          s.scene,
          s.pack,
          s.note,
          s.speaker,
          s.dialogue,
          chapterOf(s.scene),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        if (!!a[1].pinned !== !!b[1].pinned) return a[1].pinned ? -1 : 1;
        return b[1].savedAt - a[1].savedAt;
      });
  }, [slots, query]);

  const groups = useMemo(() => {
    const map = new Map<string, [string, Snapshot][]>();
    for (const e of entries) {
      const ch = chapterOf(e[1].scene);
      const arr = map.get(ch) ?? [];
      arr.push(e);
      map.set(ch, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [entries]);

  const shown = tab === "pinned" ? entries.filter(([, s]) => s.pinned) : entries;

  const card = (id: string, s: Snapshot) => (
    <article key={id} className={`archive-card ${s.pinned ? "pinned" : ""}`}>
      <button className="archive-thumb" onClick={() => onLoad(s)} title="Load">
        {s.thumbnail ? <img src={s.thumbnail} alt="" /> : <span>no image</span>}
        <em>#{id}</em>
      </button>
      <div className="archive-info">
        <div className="archive-title">
          <b>
            {s.scene || s.pack}:{s.pc}
          </b>
          <span>{chapterOf(s.scene)}</span>
          <time>{when(s.savedAt)}</time>
        </div>
        <div className="archive-line">
          {s.speaker ? <b>{s.speaker}　</b> : null}
          <span>{(s.note || s.dialogue || "…").replace(/\s+/g, " ").slice(0, 100)}</span>
        </div>
        {editing === id ? (
          <div className="archive-note-edit">
            <input
              autoFocus
              value={draft}
              placeholder="note…"
              onChange={(ev) => setDraft(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") {
                  ev.preventDefault();
                  ev.stopPropagation();
                  onUpdate(id, { note: draft.trim() });
                  setEditing(null);
                } else if (ev.key === "Escape") {
                  ev.stopPropagation();
                  setEditing(null);
                }
              }}
            />
            <button
              onClick={() => {
                onUpdate(id, { note: draft.trim() });
                setEditing(null);
              }}
            >
              Save
            </button>
          </div>
        ) : (
          <button
            className={`archive-note ${s.note ? "has" : ""}`}
            onClick={() => {
              setEditing(id);
              setDraft(s.note ?? "");
            }}
          >
            {s.note ? `📝 ${s.note}` : "add note"}
          </button>
        )}
        <div className="archive-actions">
          <button
            className={`archive-pin ${s.pinned ? "on" : ""}`}
            onClick={() => onUpdate(id, { pinned: !s.pinned })}
            title="Pin"
          >
            {s.pinned ? "★" : "☆"}
          </button>
          {canSave && <button onClick={() => onOverwrite(id)}>Overwrite</button>}
          {confirmDelete === id ? (
            <>
              <button className="danger" onClick={() => onDelete(id)}>
                Confirm
              </button>
              <button onClick={() => setConfirmDelete(null)}>Cancel</button>
            </>
          ) : (
            <button className="danger" onClick={() => setConfirmDelete(id)}>
              Delete
            </button>
          )}
          <button className="primary" onClick={() => onLoad(s)}>
            Load
          </button>
        </div>
      </div>
    </article>
  );

  return (
    <aside className="side-window archive-window">
      <header className="archive-head">
        <div className="side-head-top">
          <strong>Archives</strong>
          <span>
            {currentScene || "—"}:{currentPC}
          </span>
          <button className="side-close" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <div className="side-head-tools">
          <input
            className="archive-search"
            autoFocus
            placeholder="search saves…"
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
          />
          <button className="primary" disabled={!canSave} onClick={onSaveNew}>
            Save
          </button>
        </div>
      </header>

      <nav className="archive-tabs">
        <button className={tab === "recent" ? "on" : ""} onClick={() => setTab("recent")}>
          Recent
        </button>
        <button className={tab === "pinned" ? "on" : ""} onClick={() => setTab("pinned")}>
          Pinned
        </button>
        <button className={tab === "chapters" ? "on" : ""} onClick={() => setTab("chapters")}>
          Chapters
        </button>
      </nav>

      <div className="archive-list">
        {entries.length === 0 && <p className="archive-empty">No saves yet.</p>}
        {tab === "chapters"
          ? groups.map(([chapter, list]) => (
              <section key={chapter} className="archive-group">
                <h4>{chapter}</h4>
                <div className="archive-grid">{list.map(([id, s]) => card(id, s))}</div>
              </section>
            ))
          : (
              <div className="archive-grid">{shown.map(([id, s]) => card(id, s))}</div>
            )}
      </div>
    </aside>
  );

}
