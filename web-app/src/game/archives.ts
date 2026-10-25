import type { Snapshot } from "./player";

export type ArchiveMap = Record<string, Snapshot>;

const ARCHIVE_KEY = "mitama.archives.v1";
const LEGACY_SAVE_KEY = "mitama.saves.v1";

export function readArchives(): ArchiveMap {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    if (raw) return JSON.parse(raw) as ArchiveMap;
  } catch {
    // fall through to legacy migration
  }
  try {
    const raw = localStorage.getItem(LEGACY_SAVE_KEY);
    if (!raw) return {};
    const old = JSON.parse(raw) as (Snapshot | null)[];
    const out: ArchiveMap = {};
    old.forEach((snap, i) => {
      if (snap) out[String(i + 1)] = snap;
    });
    writeArchives(out);
    return out;
  } catch {
    return {};
  }
}

export function writeArchives(archives: ArchiveMap): void {
  try {
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archives));
  } catch {
    // localStorage may be unavailable or full; saves are best-effort.
  }
}

/**
 * New archives use a client-generated ID so two browsers saving at the same
 * time cannot overwrite each other. Existing numeric IDs remain valid.
 */
export function nextArchiveID(archives: ArchiveMap): string {
  const base = `a${Date.now().toString(36)}`;
  let id = base;
  for (let suffix = 1; archives[id]; suffix++) id = `${base}-${suffix}`;
  return id;
}

const DELETE_KEY = "mitama.archive-deletes.v1";

export function readPendingDeletes(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export function writePendingDeletes(ids: Set<string>): void {
  try {
    localStorage.setItem(DELETE_KEY, JSON.stringify([...ids]));
  } catch {
    // best-effort, same as archive storage
  }
}

export function makeThumbnail(canvas: HTMLCanvasElement | null): string | undefined {
  if (!canvas) return undefined;
  try {
    const t = document.createElement("canvas");
    t.width = 320;
    t.height = 240;
    const g = t.getContext("2d");
    if (!g) return undefined;
    g.drawImage(canvas, 0, 0, t.width, t.height);
    return t.toDataURL("image/jpeg", 0.6);
  } catch {
    return undefined;
  }
}
