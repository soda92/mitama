import { useEffect, useMemo, useRef, useState } from "react";
import type {
  GalleryData,
  GalleryPicture,
  GallerySeen,
  GalleryTrack,
} from "../game/gallery";
import { speakerDisplayName } from "../game/types";

interface GalleryProps {
  initialTab?: Tab;
  packId: string;
  seen: GallerySeen;
  bgmVolume: number;
  muted: boolean;
  onSeen: (kind: keyof GallerySeen, key: string) => void;
  onClose: () => void;
  onPlayScene: (name: string, pc?: number) => void;
  onViewStory: (name: string, pc?: number) => void;
}

type Tab = "pictures" | "scenes" | "music";

export default function Gallery({
  initialTab = "pictures",
  packId,
  seen,
  bgmVolume,
  muted,
  onSeen,
  onClose,
  onPlayScene,
  onViewStory,
}: GalleryProps) {
  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);
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

  const eventGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, GalleryData["scenes"]>();
    for (const scene of data?.scenes ?? []) {
      if (!scene.event) continue;
      const hay = [scene.name, scene.title, scene.heroine].filter(Boolean).join(" ").toLowerCase();
      if (q && !hay.includes(q)) continue;
      const group = scene.protagonist === "oboro" ? "朧編" : "八尋編";
      const list = map.get(group) ?? [];
      list.push(scene);
      map.set(group, list);
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a === "八尋編" ? -1 : b === "八尋編" ? 1 : a.localeCompare(b)))
      .map(([group, scenes]) => [group, [...scenes].sort((a, b) => a.name.localeCompare(b.name))] as const);
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
            <p className="gallery-event-note">
              Event recollection scenes. Story chapters are in Navigator → Chapters.
            </p>
            {eventGroups.length === 0 && (
              <p className="gallery-empty">No matching event scenes.</p>
            )}
            {eventGroups.map(([group, scenes]) => (
              <section key={group} className="gallery-scene-group">
                <h4>{group}</h4>
                <div className="gallery-event-grid">
                  {scenes.map((scene) => {
                    return (
                      <div
                        key={scene.name}
                        className={`gallery-event-card ${seen.scenes[scene.name] ? "seen" : ""}`}
                      >
                        <button
                          className="gallery-event-play"
                          onClick={() => {
                            onSeen("scenes", scene.name);
                            onPlayScene(scene.name);
                          }}
                          title={`Play ${scene.name}`}
                        >
                          <span className="gallery-event-cover">
                            {scene.coverThumb || scene.cover ? (
                              <img
                                src={scene.coverThumb || scene.cover}
                                alt=""
                                loading="lazy"
                                onError={(ev) => {
                                  if (scene.cover && ev.currentTarget.src !== scene.cover) {
                                    ev.currentTarget.src = scene.cover;
                                  }
                                }}
                              />
                            ) : (
                              <span className="gallery-event-placeholder">EVENT</span>
                            )}
                          </span>
                          <span className="gallery-event-info">
                            <b>{scene.heroine || "女性"}</b>
                            <span>{scene.title !== scene.name ? scene.title : scene.name}</span>
                            {scene.title !== scene.name && <small>{scene.name}</small>}
                          </span>
                        </button>
                        <span className="gallery-event-badge">EVENT</span>
                        {scene.base && (
                          <button
                            className="gallery-event-story"
                            onClick={() => onViewStory(scene.base!)}
                            title={`View story around ${scene.base}`}
                          >
                            Story
                          </button>
                        )}
                        {seen.scenes[scene.name] && <i>✓</i>}
                      </div>
                    );
                  })}
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
                    <b>{track.title || track.name}</b>
                    <span>
                      {[
                        track.title ? track.name : "",
                        track.duration || "",
                        track.count > 0
                          ? `${track.count} use${track.count === 1 ? "" : "s"}${
                              track.uses.length ? ` · ${track.uses.join(", ")}` : ""
                            }`
                          : "unused",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
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
                    {use.speaker && <em>{speakerDisplayName(use.speaker)}</em>}
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
