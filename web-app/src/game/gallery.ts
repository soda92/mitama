export interface GalleryPictureUse {
  scene: string;
  pc: number;
  line?: number;
  speaker?: string;
  dialogue?: string;
}

export interface GalleryPicture {
  key: string;
  name: string;
  full: string;
  thumb?: string;
  variants: string[];
  uses?: GalleryPictureUse[];
}

export interface GalleryScene {
  name: string;
  title: string;
  chapter: string;
}

export interface GalleryTrack {
  name: string;
  file: string;
  uses: string[];
  count: number;
}

export interface GalleryData {
  pictures: GalleryPicture[];
  scenes: GalleryScene[];
  music: GalleryTrack[];
}

export interface GallerySeen {
  pictures: Record<string, boolean>;
  scenes: Record<string, boolean>;
  music: Record<string, boolean>;
}

export type GalleryKind = keyof GallerySeen;

export const GALLERY_KEY = "mitama.gallery.v1";

const EMPTY: GallerySeen = { pictures: {}, scenes: {}, music: {} };

export function readSeen(): GallerySeen {
  try {
    const raw = localStorage.getItem(GALLERY_KEY);
    if (!raw) return { pictures: {}, scenes: {}, music: {} };
    const parsed = JSON.parse(raw) as Partial<GallerySeen> | null;
    if (!parsed || typeof parsed !== "object") return EMPTY;
    return {
      pictures: parsed.pictures ?? {},
      scenes: parsed.scenes ?? {},
      music: parsed.music ?? {},
    };
  } catch {
    return EMPTY;
  }
}

export function writeSeen(seen: GallerySeen): void {
  try {
    localStorage.setItem(GALLERY_KEY, JSON.stringify(seen));
  } catch {
    // best-effort persistence
  }
}

/** Normalize a CG BMP name to the gallery grouping key. */
export function pictureKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.bmp$/i, "")
    .replace(/s$/, "")
    .replace(/_[0-9]+$/, "");
}
