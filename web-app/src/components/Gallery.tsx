import { useEffect, useMemo, useRef, useState } from "react";
import type {
  GalleryData,
  GalleryPicture,
  GallerySeen,
  GalleryTrack,
} from "../game/gallery";

interface GalleryProps {
  initialTab?: Tab;
  packId: string;
  seen: GallerySeen;
  bgmVolume: number;
  muted: boolean;
  onSeen: (kind: keyof GallerySeen, key: string) => void;
  onClose: () => void;
  onPlayScene: (name: string, pc?: number) => void;
}

type Tab = "pictures" | "scenes" | "music";

function chapterLabel(chapter: string): string {
  const match = chapter.match(/^([a-z]+)(\d+)$/i);
  return match ? `${match[1].toUpperCase()} ${match[2]}` : chapter.toUpperCase();
}

export default function Gallery({
  initialTab = "pictures",
  packId,
  seen,
  bgmVolume,
  muted,
  onSeen,
  onClose,
  onPlayScene,
}: GalleryProps) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [data, setData] = useState<GalleryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [viewer, setViewer] = useState<{ picture: GalleryPicture; index: number } | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    fetch(`/api/gallery?pack=${encodeURIComponent(packId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`gallery: HTTP ${response.status}`);
        return (await response.json()) as GalleryData;
      })
      .then((body) => !cancelled && setData(body))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
    };
  }, [packId]);

  useEffect(
    () => () => {
      if (audio.current) {
        audio.current.pause();
        audio.current.src = "";
      }
    },
    [],
  );

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (viewer) {
        if (ev.key === "Escape") {
          ev.preventDefault();
          setViewer(null);
        } else if (ev.key === "ArrowLeft") {
          ev.preventDefault();
          setViewer({ ...viewer, index: Math.max(0, viewer.index - 1) });
        } else if (ev.key === "ArrowRight" || ev.key === "Enter") {
          ev.preventDefault();
          setViewer({
            ...viewer,
            index: Math.min(viewer.picture.variants.length - 1, viewer.index + 1),
          });
        }
        return;
      }
      if (ev.key === "Escape") {
        ev.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewer, onClose]);

  const stopMusic = () => {
    if (audio.current) {
      audio.current.pause();
      audio.current.src = "";
      audio.current = null;
    }
    setPlaying(null);
  };

  const playTrack = (track: GalleryTrack) => {
    if (playing === track.name) {
      stopMusic();
      return;
    }
    stopMusic();
    const el = new Audio(
      `/api/audio?pack=${encodeURIComponent(packId)}&file=${encodeURIComponent(track.file)}`,
    );
    el.loop = true;
    el.volume = muted ? 0 : bgmVolume;
    audio.current = el;
    setPlaying(track.name);
    onSeen("music", track.name);
    void el.play().catch(() => undefined);
  };

  useEffect(() => {
    if (audio.current) audio.current.volume = muted ? 0 : bgmVolume;
  }, [bgmVolume, muted]);

  const filteredPictures = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.pictures ?? []).filter((p) => !q || p.key.includes(q) || p.name.toLowerCase().includes(q));
  }, [data, query]);

  const sceneGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, GalleryData["scenes"]>();
    for (const scene of data?.scenes ?? []) {
      if (q && !scene.name.toLowerCase().includes(q) && !scene.title.toLowerCase().includes(q)) continue;
      const chapter = chapterLabel(scene.chapter);
      const list = map.get(chapter) ?? [];
      list.push(scene);
      map.set(chapter, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [data, query]);

  const filteredMusic = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.music ?? []).filter(
      (track) => !q || track.name.toLowerCase().includes(q) || track.uses.some((use) => use.includes(q)),
    );
  }, [data, query]);

  const openPicture = (picture: GalleryPicture, index = 0) => {
    onSeen("pictures", picture.key);
    setViewer({ picture, index });
  };

  return (
    <div
      className="gallery-overlay"
      onClick={(ev) => {
        ev.stopPropagation();
        onClose();
      }}
    >
      <div className="gallery-window" onClick={(ev) => ev.stopPropagation()}>
        <header className="gallery-head">
          <strong>Gallery</strong>
          <nav className="gallery-tabs">
            <button className={tab === "pictures" ? "on" : ""} onClick={() => setTab("pictures")}>
              Pictures
            </button>
            <button className={tab === "scenes" ? "on" : ""} onClick={() => setTab("scenes")}>
              Scenes
            </button>
            <button className={tab === "music" ? "on" : ""} onClick={() => setTab("music")}>
              Music
            </button>
          </nav>
          <input
            className="archive-search"
            placeholder="filter…"
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
          />
          <button onClick={onClose}>✕</button>
        </header>

        {error && <p className="gallery-empty">{error}</p>}
        {!data && !error && <p className="gallery-empty">loading gallery…</p>}

        {data && tab === "pictures" && (
          <div className="gallery-scroll">
            <div className="gallery-grid pictures">
              {filteredPictures.map((picture) => (
                <button
                  key={picture.key}
                  className={`gallery-card ${seen.pictures[picture.key] ? "seen" : ""}`}
                  onClick={() => openPicture(picture)}
                  title={picture.name}
                >
                  <img
                    src={picture.thumb || picture.full}
                    alt=""
                    loading="lazy"
                    onError={(ev) => {
                      if (ev.currentTarget.src !== picture.full) ev.currentTarget.src = picture.full;
                    }}
                  />
                  <span>{picture.name}</span>
                  {seen.pictures[picture.key] && <i>✓</i>}
                </button>
              ))}
            </div>
          </div>
        )}

        {data && tab === "scenes" && (
          <div className="gallery-scroll">
            {sceneGroups.map(([chapter, scenes]) => (
              <section key={chapter} className="gallery-scene-group">
                <h4>{chapter}</h4>
                <div className="gallery-scene-grid">
                  {scenes.map((scene) => (
                    <button
                      key={scene.name}
                      className={seen.scenes[scene.name] ? "seen" : ""}
                      onClick={() => {
                        onSeen("scenes", scene.name);
                        onPlayScene(scene.name);
                      }}
                    >
                      <b>{scene.title}</b>
                      {scene.title !== scene.name && <span>{scene.name}</span>}
                      {seen.scenes[scene.name] && <i>✓</i>}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {data && tab === "music" && (
          <div className="gallery-scroll">
            <div className="gallery-music">
              {filteredMusic.map((track) => (
                <div
                  key={track.name}
                  className={`gallery-track ${playing === track.name ? "playing" : ""} ${
                    seen.music[track.name] ? "seen" : ""
                  }`}
                >
                  <button className="gallery-play" onClick={() => playTrack(track)}>
                    {playing === track.name ? "■" : "▶"}
                  </button>
                  <div>
                    <b>{track.name}</b>
                    <span>
                      {track.count > 0
                        ? `${track.count} use${track.count === 1 ? "" : "s"}${
                            track.uses.length ? ` · ${track.uses.join(", ")}` : ""
                          }`
                        : "unused"}
                    </span>
                  </div>
                  {seen.music[track.name] && <i>✓</i>}
                </div>
              ))}
            </div>
          </div>
        )}

        {viewer && (
          <div className="gallery-viewer" onClick={() => setViewer(null)}>
            <button
              className="gallery-arrow left"
              disabled={viewer.index === 0}
              onClick={(ev) => {
                ev.stopPropagation();
                setViewer({ ...viewer, index: Math.max(0, viewer.index - 1) });
              }}
            >
              ‹
            </button>
            <img
              src={viewer.picture.variants[viewer.index]}
              alt={viewer.picture.name}
              onClick={(ev) => ev.stopPropagation()}
            />
            <button
              className="gallery-arrow right"
              disabled={viewer.index >= viewer.picture.variants.length - 1}
              onClick={(ev) => {
                ev.stopPropagation();
                setViewer({
                  ...viewer,
                  index: Math.min(viewer.picture.variants.length - 1, viewer.index + 1),
                });
              }}
            >
              ›
            </button>
            {viewer.picture.uses && viewer.picture.uses.length > 0 && (
              <div className="gallery-viewer-uses">
                <span>Story</span>
                {viewer.picture.uses.slice(0, 5).map((use) => (
                  <button
                    key={`${use.scene}:${use.pc}`}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onSeen("scenes", use.scene);
                      onPlayScene(use.scene, use.pc);
                    }}
                    title={use.dialogue}
                  >
                    <b>{use.scene}</b>
                    {use.speaker && <em>{use.speaker}</em>}
                    {use.dialogue && <small>{use.dialogue}</small>}
                  </button>
                ))}
              </div>
            )}
            <div className="gallery-viewer-caption">
              {viewer.picture.name} · {viewer.index + 1}/{viewer.picture.variants.length}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
