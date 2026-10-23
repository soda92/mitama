# Progress

Last updated: 2026-10-24.

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
- [x] CP932 dialogue parser with multi-line quotes and speaker names.
- [x] Text box, typewriter, click/Enter to advance, `￥` page breaks.
- [x] Layered stage: background + L/R/C character stands, composited at
      natural size with a black color key (fixes stretched sprites).
- [x] DVD pack selection and lazy `LOD` script loading.
- [x] Opening `yr1_00.txt` plays to `LOD YR1_01`.
- [x] Scene/chapter links in the URL (`?pack=dvd&scene=yr1_02&cmd=123`).
- [x] Archive manager: Recent/Pinned/Chapters, search, notes, pinning,
      thumbnails, overwrite/delete, save current, legacy-slot migration.
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
- [x] Resuming at a TEXT line replays the preceding `SEV` voice.
- [x] Engine debug panel (`D` / `?debug=1`) and `/api/debug` APIs.
- [x] 3× canvas rendering for crisp dialogue text; fit-to-viewport layout.
- [x] Title screen removed; selected pack auto-starts.
- [x] Space hides dialogue and HUD; click/Enter restores/advances.
- [x] Fullscreen keeps a letterboxed 4:3 stage.
- [x] Inline voice/SE annotations are hidden and played as page cues.
- [x] Header/footer removed; controls live on the dialogue box and in ☰
      Settings (pack, volume, debug).
- [x] Background stack semantics: `BMP BLACK 消去` reveals the background
      underneath instead of clearing it.
- [x] Dialogue box is opaque and the whole frame is redrawn per typewriter
      tick (no stale/accumulated box alpha).
- [x] Adjustable dialogue opacity in Settings (persisted per browser).
- [x] Replay-voice button beside the speaker name tag (current page/line).

## In progress

- [x] Full-game flags (`IFT`, `FLG`, `EQU`, `INC`, `DEC`, `FCK`, `RND`).
- [x] Flags are included in save snapshots.
- [x] `MAP`/`PARTY` state tracking for debug and save-resume replay.
- [x] `.pty` / `.chr` battle definition parser and `/api/battle` endpoints.
- [x] Playable simplified battle screen: shared party HP, enemy strikers,
      剣/術/受 actions, victory/defeat, flag `20` branching.
- [x] Battle auto-resolve modes (win/lose/random) remain in Settings.
- [ ] Battle motion/sprite playback, specials, action rates and exact damage.
- [ ] Interactive map movement and encounters.
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
