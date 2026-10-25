import type { Snapshot } from "./player";
import type { ArchiveMap } from "./archives";

export type ArchiveSyncState = "local" | "syncing" | "online" | "offline";

interface ArchiveResponse {
  archives?: ArchiveMap;
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path}: HTTP ${res.status}`);
  return res;
}

export async function fetchServerArchives(): Promise<ArchiveMap> {
  const res = await request("/api/archives");
  const body = (await res.json()) as ArchiveResponse;
  return body.archives ?? {};
}

export async function pushServerArchive(id: string, snap: Snapshot): Promise<void> {
  await request(`/api/archives/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snap),
  });
}

export async function removeServerArchive(id: string): Promise<void> {
  await request(`/api/archives/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Merge by id, keeping the newer savedAt. Returns snapshots to upload. */
export function mergeArchives(
  local: ArchiveMap,
  remote: ArchiveMap,
): { merged: ArchiveMap; upload: Array<[string, Snapshot]> } {
  const merged: ArchiveMap = { ...remote };
  const upload: Array<[string, Snapshot]> = [];
  for (const [id, snap] of Object.entries(local)) {
    const current = remote[id];
    if (!current || (snap.savedAt ?? 0) > (current.savedAt ?? 0)) {
      merged[id] = snap;
      upload.push([id, snap]);
    }
  }
  return { merged, upload };
}
