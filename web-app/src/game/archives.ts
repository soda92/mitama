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

export function nextArchiveID(archives: ArchiveMap): string {
  let max = 0;
  for (const id of Object.keys(archives)) {
    const n = Number.parseInt(id, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1);
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
