# mitama

A from-scratch web engine for Ciel's **御魂 ～忍～ / Mitama ~Shinobi~** (2001),
the adventure/RPG built on Ciel's **ARCANA** engine.

The project has two halves:

- **Go backend** — disc/ISO reader, ARC archive reader, LZSS decoder, asset
  extractor, and HTTP server.
- **React + Vite frontend** — a 640×480 canvas player that reimplements the
  engine's script VM, transitions, audio and (eventually) the RPG systems.

Nothing from the original game is included. You must own the game and point the
extractor at your own data.

## Status

| Area | Status |
| --- | --- |
| CloneCD / ISO / UDF disc reading | ISO 9660 implemented; UDF read from extracted files |
| `.arc` directory format | ✅ decoded (key `arcana`) |
| LZSS-compressed BMP / text payloads | ✅ decoded |
| `KWD1` `.XA` audio codec | ✅ decoded, verified against `xadec.dll` |
| Full-game asset extraction | ✅ `mitama.arc` etc. extract correctly |
| Demo command VM (BMP/UPD/WAIT/MUS/SEV/JMP) | ✅ implemented |
| Text / dialogue rendering (typewriter, click, `￥` pages) | ✅ implemented |
| Layered stage (BG + L/R/C stands, black color key) | ✅ implemented |
| DVD opening and chapter 1 (`yr1_00` → `yr1_02`) | ✅ plays with text, images, BGM, voice |
| Choices (`SLT` / `MSLT`) and `LOD` chapter changes | ✅ implemented |
| Scene URLs and save/load slots | ✅ implemented |
| Full-game flags (`IFT`/`FLG`/`EQU`/`FCK`/`RND`) | ✅ basic implementation |
| Map movement, party, battle | ⛔ next |
| Sprite/monster/map formats (`.spt` `.mtn` `.o`) | ⛔ next |

See [docs/progress.md](docs/progress.md) for the working checklist and
[docs/formats/arc.md](docs/formats/arc.md) for the reverse-engineered archive
format.

## Quick start

### 1. Prepare data

The DVD-ROM edition contains the full game as ARC archives. Extract them first
(7-Zip understands the UDF ISO), then unpack the ARC files:

```sh
mkdir -p .cache/dvd
7z x "mitama-dvd.iso" -o.cache/dvd '*.arc' '*.exe' '*.dll'
go run ./cmd/extract -src .cache/dvd -out ./data -pack dvd
```

You can also point the extractor directly at an **ISO 9660** image:

```sh
go run ./cmd/extract -src /path/to/IMAGE.iso -out ./data -pack disc
```

The first-press CCD disc (`kunoichi.arc`) is a **voice-only disc**:
8,053 `.XA` files plus `kunoichi.asc`. The DVD image is the full game.

The shop-demo data on the bonus disc can be extracted from a directory:

```sh
go run ./cmd/extract -src /path/to/mitama_demo -out ./data -pack demo
```

### 2. Build the frontend

```sh
cd web-app
pnpm install
pnpm build
```

### 3. Run

```sh
go run ./cmd/server            # http://localhost:8080
```

Development mode (Vite HMR, Go API on :8080):

```sh
go run ./cmd/server &
cd web-app && pnpm dev         # http://localhost:5173
```

Flags: `-data ./data`, `-web ./web-app/dist`, `-addr :8080`.

### Scene links and saves

The current scene and command index are always reflected in the URL:

```text
http://localhost:8080/?pack=dvd&scene=yr1_02&cmd=123
```

Open such a link, press Start, and playback resumes at that command. `pack` is
`demo`, `dvd`, or `disc`; `scene` is a `text.arc` script name; `cmd` is a
zero-based command index.

The player has four save slots stored in `localStorage`. A snapshot records the
pack, scene, command index, current background and a thumbnail. Save/load while
a dialogue or menu is open restores that interaction.

## Layout

```text
cmd/extract/        ARC/ISO asset extractor
cmd/xadecode/       KWD1 .xa → WAV converter
cmd/server/         HTTP server + JSON API + static media
pkg/arc/            ARC directory and LZSS payload decoding
pkg/disc/           ISO 9660 / CloneCD / MDF image reader
pkg/lzss/           ARCANA LZSS codec
pkg/script/         CP932 command-script parser
pkg/xa/             KWD1 audio codec (PCM output)
web-app/            React 19 + Vite + TypeScript player
docs/               Format notes, engine notes, roadmap
data/               Extracted assets (gitignored)
.cache/             Disc images and intermediate files (gitignored)
```

## Tests

```sh
go test ./...
cd web-app && pnpm build
```

The UI is smoke-tested manually through Chrome DevTools MCP (navigate, Start,
advance with Enter, screenshot, inspect console/network).

## Documentation

- [docs/index.md](docs/index.md) — overview
- [docs/formats/disc.md](docs/formats/disc.md) — CCD/MDF/ISO/UDF notes
- [docs/formats/arc.md](docs/formats/arc.md) — ARC directory + LZSS
- [docs/formats/xa.md](docs/formats/xa.md) — KWD1 / `.XA` audio
- [docs/engine/script.md](docs/engine/script.md) — command language
- [docs/progress.md](docs/progress.md) — what works, what is next
