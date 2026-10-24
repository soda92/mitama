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
| Scene URLs, page/chapter navigator and archive manager | ✅ implemented |
| Full-game flags (`IFT`/`FLG`/`EQU`/`FCK`/`RND`) | ✅ basic implementation |
| Map/party state and playable simplified battles | ◐ partial |
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

### Scene links, navigator and archives

The current scene and command index are always reflected in the URL:

```text
http://localhost:8080/?pack=dvd&scene=yr1_02&cmd=123
```

Open such a link, press Start, and playback resumes at that command. `pack` is
`demo`, `dvd`, or `disc`; `scene` is a `text.arc` script name; `cmd` is a
zero-based command index.

The **Archives** manager opens in a docked side window beside the stage (the
stage resizes rather than being covered) and keeps saves in `localStorage`. It
supports:

- Recent / Pinned / Chapters views
- search across scene, note, speaker and dialogue
- thumbnails, notes, pinning, overwrite, delete
- save-current with speaker/dialogue metadata
- restoring pack, scene, command, stage layers, flags and audio position

Old four-slot saves are migrated automatically. Save/load while a dialogue or
menu is open restores that interaction.

The **Navigate** button (or **N**) opens a docked side window with two tabs:

- **Page** — scrub or step through the current script's command list, previews
  dialogue/command text and jumps directly to any command.
- **Chapters** — every `text.arc` script grouped by chapter (`YR 1`, `YR 2`,
  `EOA 4`, …), with filtering and one-click chapter entry.

Seeking reloads the scene at the chosen command and reconstructs stage, flags
and audio, so it works for both text and command positions. Both side windows
stay beside the stage and remain docked in fullscreen.

### Controls

- **Click / Enter / ↓ / →** — advance dialogue
- **声** — replay the current line's voice (button beside the speaker tag)
- **Space** — hide/show the dialogue and HUD
- **P** — pause
- **M** — mute
- **F** — fullscreen (letterboxed 4:3)
- **D** — engine debug panel
- **N** — page/chapter navigator
- **G** — gallery (pictures, scenes, music)
- **I** — immersive subtitle mode

The title screen (`title007.bmp`) is shown on a normal launch with entries for
new/continue, pictures, scene review, music, settings and quit. Scene links
(`?scene=…&cmd=…`) still auto-start; add `?home=0` to bypass the title screen
for a plain pack launch.
Pack/BGM volume/SE volume/dialog opacity/battle result/status live in the
**☰ Settings** panel, while
Archives/Navigate are buttons on the dialogue box. The active side window can
be closed from its header or by pressing **Escape**. **I** toggles immersive
mode: the dialogue box and toolbar disappear and dialogue becomes a frameless
subtitle pill; press **I** again to restore the normal UI. Clicking the game screen
returns focus to the game, so **Enter** and the arrow keys keep advancing
dialogue while a side window is open. Scene links (`?scene=…&cmd=…`) resume
directly.

Settings are persisted in `localStorage` under `mitama.settings.v1` as JSON:

```json
{
  "bgmVolume": 0.7,
  "seVolume": 0.7,
  "muted": false,
  "dialogOpacity": 1,
  "immersiveMode": false,
  "battlePolicy": "play"
}
```

The old `mitama.dialogOpacity` and `mitama.battlePolicy` keys are migrated on
first load. BGM and SE volumes are independent; mute silences both.

Battles now open a playable simplified battle screen. `.pty` parties and
`.chr` characters are parsed by the Go server; battle BGM, HP, enemy strikers,
`.o`/`.spt`/`.mtn` idle and action sprites, **剣 / 術 / 受** actions,
weighted enemy action rates, special techniques, and motion-driven SE/flash, effect sprites and movement, plus optional win/lose
jingles, are available. Victory or defeat sets flag
`20`, so the script branches normally. **Settings → battle** can instead use
auto-win, auto-lose or random for story testing. See
[docs/engine/battle.md](docs/engine/battle.md).

### Title screen

A normal launch (`/?pack=dvd`) shows the original title image and its seven
entries:

- **任務開始** — new game from the pack opening
- **任務再開** — most recent archive, otherwise the pack opening
- **絵巻鑑賞** — Gallery → Pictures
- **回想閲覧** — Gallery → Scenes
- **音楽再生** — Gallery → Music
- **環境設定** — Settings
- **終了** — request tab close

Scene/debug links with `?scene=…&cmd=…` bypass the title screen. `?home=1`
forces it; `?home=0` disables it.

### Gallery

Settings → **Gallery** (or **G**) opens a three-tab viewer:

- **Pictures** — CG thumbnails with full-size viewer, variant stepping and
  story jumps to the scene/command where the CG appears
- **Scenes** — chapter-grouped scene replay
- **Music** — BGM preview with play/stop and script usage

Seen pictures/scenes/tracks are persisted in `localStorage` under
`mitama.gallery.v1`. Story BGM is suspended while the gallery is open.

### Debugging

Open the player with `?debug=1`, or press **D**, to show the engine debug panel.
It exposes scene/command position, dialogue progress, stage layers, flags and
live audio state. The same state is reachable from DevTools:

```js
window.__mitama.state()   // full snapshot
window.__mitama.flags()   // flag map
window.__mitama.audio()   // BGM/SE state
window.__mitama.stage()   // bg/l/r/c layer names
window.__mitama.advance()
window.__mitama.choose("label")
window.__mitama.setFlag(31, 2)
```

The browser mirrors the state to the Go server once per second, so it can also
be inspected with curl:

```sh
curl localhost:8080/api/debug/state | jq
curl localhost:8080/api/debug | jq
```

`/api/debug` also reports the audio cache size and available packs.

Scene links (`?scene=…&cmd=…`) auto-start and reconstruct the stage, flags and
BGM by replaying the preceding commands. Resuming at a dialogue line also
replays the immediately preceding `SEV` voice command.

## Layout

```text
cmd/extract/        ARC/ISO asset extractor
cmd/xadecode/       KWD1 .xa → WAV converter
cmd/server/         HTTP server + JSON API + static media
pkg/arc/            ARC directory and LZSS payload decoding
pkg/disc/           ISO 9660 / CloneCD / MDF image reader
pkg/lzss/           ARCANA LZSS codec
pkg/battle/         .pty / .chr battle definition parser
pkg/script/         CP932 command-script parser
pkg/xa/             KWD1 audio codec (PCM output)
web-app/            React 19 + Vite + TypeScript player
  src/game/player/  audio, dialogue and stage renderer modules
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
