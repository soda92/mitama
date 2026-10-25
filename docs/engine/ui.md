# UI, input and presentation

Last updated: 2026-10-25.

The game frame is a 4:3 canvas inside a responsive shell. Title, Gallery,
Archives, Navigator, Settings and the dialogue text are DOM overlays; only the
stage art and effects are canvas.

## Layout

```text
.shell
└── .play-area
    ├── .stage-wrap (4:3)
    │   └── .screen
    │       ├── canvas          stage art
    │       ├── dialogue DOM    dialogue box / subtitle pill
    │       ├── title / select  DOM screens
    │       └── help / notices
    └── side windows             Archives / Navigator / Settings
```

A single side dock **docks beside** the stage. It has tabs for **Archives**,
**Navigator** and **Settings**, so those panels never appear side-by-side or
overflow the play area. Opening a different panel switches the dock tab;
closing the dock closes the active panel. The stage shrinks instead of being
covered, including in fullscreen.

## Title screen

The original `title007.bmp` is used with transparent hit areas for:

- 任務開始
- 任務再開
- 絵巻鑑賞
- 回想閲覧
- 音楽再生
- 環境設定
- 終了

任務開始 opens the original 主人公選択 screen (`GUIS001.bmp`):

- 八尋 → `yr1_00`
- 朧 → `os1_00`

Escape/戻る returns to the title.

URL state:

```text
?pack=dvd&view=title
?pack=dvd&view=protagonist
?pack=dvd&view=gallery&tab=music
```

`?scene=…&cmd=…` bypasses the title. `home=0` bypasses it; `home=1` forces it.

## Dialogue

Dialogue is DOM, which makes it selectable and copyable. The canvas is not
involved.

- Speaker abbreviations are expanded in the name tag.
- The microphone button replays the current page's voice.
- Dragging to select text does not advance the story.
- Narration (`説`) has no name tag.
- Dialogue opacity is controlled from Settings and applies to the box,
  toolbar and hover-English tooltip.

### Typewriter

### Saving at a choice

The toolbar stays above the choice overlay. The choice panel also has a
**Save at this choice** button, and archive saves made there resume on the
choice command rather than before/after it.

`A` opens the Archives side window from gameplay.

Settings → **typewriter**:

| Mode | Behavior |
| --- | --- |
| `character` | reveal one character at a time |
| `word` | reveal one word/token at a time |
| `instant` | show the whole page immediately |

New text explicitly cancels the previous animation and is emitted with zero
visible characters before typing starts.

The first animation frame clamps negative elapsed time. Without that guard a
negative `textChars` value makes `slice(0, -1)` return almost the entire line
for one frame: the “full text flash.”

### Hover English

Enable **hover English** in Settings or press `H`. Hovering the Japanese box
shows the current page's English translation in a floating tooltip. It is
line/page-level, not word-level.

The tooltip follows the dialogue opacity and does not pause or advance the
script.

## Settings sidebar

Settings is a tab in the docked side window, not a centered modal. It contains:

- pack
- Japanese / English language
- typewriter mode (`character`, `word`, `instant`)
- hover English
- BGM volume
- SE volume
- dialogue opacity
- immersive subtitle mode
- battle policy
- Archives / Navigate / Debug / Gallery / Title / Reload actions

Settings are stored in `localStorage` under `mitama.settings.v1`.

## Shortcuts

| Key | Action |
| --- | --- |
| Click / Enter / ↓ / → | advance |
| Space | hide/show dialogue and HUD |
| `P` | pause |
| `M` | mute |
| `L` | Japanese / English |
| `H` | hover English |
| `I` | immersive subtitle mode |
| `F` | fullscreen |
| `A` | archives / save |
| `N` | navigator (Page / Chapters / Branches) |
| `G` | gallery |
| `D` | debug panel |
| `?` | shortcut help |
| Escape | close the active panel |

## Chapter / scene browser

Navigator → **Chapters** uses the scene metadata from `/api/gallery`: it groups
scenes by route and by the in-script chapter title (`STS`), rather than by raw
file prefixes. For example, `yk2_12` appears under:

```text
紅羽編 / 壊心
```

Scenes without their own `STS` title inherit the title of another scene in the
same route/chapter when possible. If no title exists, they fall back to the
filename chapter (for example `EYK 2`). The current scene is highlighted, and
scene ids remain visible for debugging.

## Story map

Navigator → **Map** shows the chapter-level story graph. The server scans all
scripts, groups scenes by `STS` chapter title, and emits one edge per choice
option that reaches a different chapter or route. Local choices are collapsed
into a count and remain available in the scene-local **Branches** tab.

The map exposes the important route switches directly, for example:

```text
紅羽編 / 壊心  →  瑞希編 / 壊心
                  PARTY OUT 紅羽 · PARTY IN 瑞希
```

The map is generated from `/api/storymap` and cached per pack. A transition is
selected first and only performed after **Jump** is confirmed.

## Branch view

Navigator → **Branches** lists the `SLT`/`MSLT` choices in the current scene.
Each option shows its target:

- a label leading to a choice in the same scene;
- a `LOD` scene transition, including route switches;
- a battle or scene end.

Options are **select then confirm**: clicking one only previews the target;
the actual jump happens from the confirmation bar. This avoids accidentally
skipping a scene while reading the choice graph.

The view is intentionally scene-local. The scripts do not contain a global
branch graph: route changes are encoded as `LOD` targets plus `PARTY` changes,
so a global map would have to be generated from all scripts.

## Immersive mode

Immersive mode hides the dialogue box and toolbar and draws the dialogue as a
centered subtitle pill. Hover English uses a second pill above it. The rest of
the input behavior is unchanged.

## HD assets

Stage composition happens at **3× logical resolution**
(`640×480 × 3 = 1920×1440`). The renderer prefers:

```text
hd4 (4×) → hd (2×) → original BMP
```

HD images are scaled back to logical size before compositing; this avoids
using a 4× asset as a 4×-sized sprite. See
[upscaling.md](upscaling.md).
