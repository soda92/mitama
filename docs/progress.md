# Progress

Last updated: 2026-10-25.

## Done

### Disc and archive layer

- [x] Read CloneCD raw images (2352-byte sectors).
- [x] Read Alcohol images with 96-byte subchannel (2448-byte sectors).
- [x] Read ISO 9660 images and stream files as `io.ReaderAt`.
- [x] Identify the first-press disc: it is a **voice-only** disc.
- [x] Crack the ARC directory: count + 36-byte records + additive key
      `arcana`.
- [x] Verify the table against offsets and against known manifests.
- [x] Implement the ARCANA LZSS codec.
- [x] Implement the `KWD1` wrapper.
- [x] Unpack every archive from the DVD-ROM edition.
- [x] Unpack the shop-demo archives and the `arcana` demo archives.

### Runtime

- [x] Go HTTP server with `/api/script`, `/api/assets`, `/media/...`.
- [x] CP932 script parser with full-width normalization and labels.
- [x] React 19 + Vite + TypeScript frontend.
- [x] 640×480 canvas stage.
- [x] BMP image loading, LRU cache and next-image prefetch.
- [x] Transitions: `クロス`, `ワイプ`, `ワイプ２`, `上下`, `円１`, `円２`.
- [x] Pause-aware clock.
- [x] BGM playback and loop.
- [x] Sound-effect and voice playback.
- [x] Script commands: `BMP`, `UPD`, `WAIT`, `MUS`, `SEV`, `JMP`, `END`.
- [x] Shop-demo loop (`JMP デモスタート`).
- [x] `cmd/extract` CLI for directories and ISO images.
- [x] CP932 dialogue parser with multi-line quotes and speaker names;
      `説` narration is normalized to an unnamed speaker.
- [x] Text box, typewriter, click/Enter to advance, `￥` page breaks.
- [x] Layered stage: background + L/R/C character stands, composited at
      natural size with a black color key (fixes stretched sprites).
- [x] DVD pack selection and lazy `LOD` script loading.
- [x] Opening `yr1_00.txt` plays to `LOD YR1_01`.
- [x] Scene/chapter links in the URL (`?pack=dvd&scene=yr1_02&cmd=123`).
- [x] Batched Google Translate sidecar for all DVD dialogue/choices;
      `L`/toolbar/Settings language switching with Japanese fallback.
- [x] Line-level repair pass for partially translated Google output; only
      moans/onomatopoeia remain untranslated.
- [x] `scripts/repair_translations.py` to rebuild partially translated pages.
- [x] Save at choice points; toolbar remains usable above the choice overlay.
- [x] Navigator Branches tab for scene-local choice targets and route changes.
- [x] Chapter browser grouped by actual `STS` titles; branch jumps require confirmation.
- [x] Global chapter-level story map at `/api/storymap`, with explicit route changes.
- [x] Side panels share one tabbed dock (Archives / Navigator / Settings) instead of overflowing side-by-side.
- [x] Ghidra helper scripts and durable reverse-engineering notes committed under `tools/ghidra` and `docs/engine/reverse-engineering.md`.
- [x] Advancing dialogue stops the previous voice clip; SE channels remain independent.
- [x] Gallery event/recollection cards show covers, heroine labels and a related
      Story link; event scenes are kept out of the story route.
- [x] Removed the experimental story-interlude path after confirming `e…`
      scripts are CG/event recollection content.
- [x] Gallery scene selection from the title screen clears title URL/state and starts the scene.
- [x] Gallery Scenes is an event/CG recollection browser with cover thumbnails,
      heroine labels and 八尋編 / 朧編 grouping.
- [x] 18+ in-story scene route/choice guide in `docs/guides`.
- [x] Archive manager: Recent/Pinned/Chapters, search, notes, pinning,
      thumbnails, overwrite/delete, save current, legacy-slot migration;
      snapshots record the 八尋/朧 route and show it on archive cards.
- [x] SQLite archive persistence (`data/mitama-saves.db`) with REST API,
      localStorage cache/fallback and offline delete queue.
- [x] Page/chapter navigator: command scrubbing, dialogue previews,
      chapter grouping, filtering and direct scene entry.
- [x] Archives and navigator docked as side windows beside the stage
      (including fullscreen) instead of centered modal overlays.
- [x] Single-select choices (`SLT` and `MSLT`); `SEND` menu terminator.
- [x] Case-insensitive `LOD` resolution (fixes `YR1_02` → `yr1_02.txt`).
- [x] Chapter transition from `yr1_01` to `YR1_02`.
- [x] KWD1 `.XA` audio decoder (`pkg/xa`), verified byte-for-byte against
      `xadec.dll` under Wine.
- [x] Server-side `.xa` → WAV conversion at `/api/audio` with an in-memory
      cache.
- [x] BGM and voice playback from the DVD data.
- [x] `kunoichi.arc` extracted into the DVD pack (female voices).
- [x] Scene URLs auto-start and rebuild stage/flags/BGM.
- [x] `-dev` Go-server mode proxies the frontend to the Vite dev server while
      keeping `/api` and `/media` on Go.
- [x] Resuming at a TEXT line replays the preceding `SEV` voice.
- [x] Engine debug panel (`D` / `?debug=1`) and `/api/debug` APIs.
- [x] Canvas stage with a DOM dialogue overlay; selectable text and
      fit-to-viewport layout.
- [x] Original title screen with new/continue, gallery, settings and quit entries;
      new game shows the original 八尋/朧 主人公選択 screen; scene links still
      auto-start. The Settings → Title entry returns
      to it and Continue resumes the current position.
- [x] Space hides dialogue and HUD; click/Enter restores/advances.
- [x] `?` opens a keyboard-shortcut help overlay; the toolbar has no pause
      button and uses a text mute control.
- [x] Fullscreen keeps a letterboxed 4:3 stage.
- [x] Inline voice/SE annotations are hidden and played as page cues.
- [x] Header/footer removed; controls live on the dialogue box and in ☰
      Settings (pack, volume, debug).
- [x] Background stack semantics: `BMP BLACK 消去` reveals the background
      underneath instead of clearing it.
- [x] Dialogue box is opaque and the DOM overlay updates per typewriter
      tick (no stale/accumulated box alpha).
- [x] Adjustable dialogue opacity and immersive subtitle mode in Settings
      (persisted per browser); Settings opens as a docked side window.
- [x] Typewriter modes: character, word and instant; fixed the first-frame
      `slice(0, -1)` flash caused by a negative RAF elapsed time.
- [x] Hover-English tooltip for Japanese dialogue, with Settings sidebar and
      `H` shortcut.
- [x] Optional HD asset overlay + waifu2x upscaling pipeline for smoother
      character stands and backgrounds, with 4× → 2× → original priority.
- [x] Independent BGM/SE volumes and unified settings persistence
      (`mitama.settings.v1`).
- [x] Replay-voice button beside the speaker name tag (current page/line),
      using a microphone icon; speaker abbreviations expanded to full names.
- [x] Gallery: CG viewer, scene review, music player with official BGM
      titles/durations, seen tracking and CG-to-script story jumps.
- [x] URL-addressable title, protagonist select, and Gallery tabs, including
      refresh-safe `view`/`tab`/`from` state.
- [x] Refactor: App settings/archive/keyboard/battle modules and Player
      audio/dialogue/stage modules extracted.

## In progress

- [x] Full-game flags (`IFT`, `FLG`, `EQU`, `INC`, `DEC`, `FCK`, `RND`).
- [x] Flags are included in save snapshots.
- [x] `MAP`/`PARTY` state tracking, includes archive snapshots and resume.
- [x] `.pty` / `.chr` battle definition parser and `/api/battle` endpoints.
- [x] Playable simplified battle screen: shared party HP, enemy strikers,
      剣/術/受 actions, victory/defeat, flag `20` branching.
- [x] Battle BGM and idle/action sprites from `.o` / `.spt` / `.mtn`
      (color-keyed).
- [x] Battle auto-resolve modes (win/lose/random) remain in Settings.
- [x] Weighted enemy actions from `:actionrate`, special techniques from
      `:special` / `:spname`, and special attack motions.
- [x] Motion `se` / `c_se` / `se_attack`, `flash`, `effectem`, movement
      offsets and parsed `waitmov` / `attackend`.
- [x] `:actionrate` power range and optional `:win`/`:lose` jingles.
- [ ] Exact attack/hit/damage formula and map encounters.
- [ ] Interactive map movement and encounters (map scenes are currently
      script-driven through `BMP MAPxxx` + `MSLT`).
- [ ] `sprite.arc` / `.spt` / `.mtn` sprite animation.
- [ ] Server-side save files compatible with `save%02d.dat`.

## Next milestone

Flesh out the battle screen with `.o` / `.spt` / `.mtn` sprites, battle BGM and
the actual action-rate/special-move rules. Then implement map movement and
encounters. Audio, chapter loading and story branching are working.

## Notes / decisions

- Extracted files are ordinary `.bmp`/`.wav`/`.txt` where possible, so the
  player and debugging tools can use native browser support.
- The **UDF** DVD image is currently unpacked with 7-Zip. A small read-only UDF
  reader is a later task; it is not required for engine work.
- The shop-demo executable is the behavioral reference for the command VM; the
  DVD executable is the reference for the full command set and flag model.
- Assets are never committed. `data/` and `.cache/` are gitignored.
