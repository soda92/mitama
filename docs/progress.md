# Progress

Last updated: 2026-10-23.

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
- [x] DVD pack selection and lazy `LOD` script loading.
- [x] Opening `yr1_00.txt` plays to `LOD YR1_01`.

## In progress

- [ ] Full-game script commands (`SLT`, `IFT`, `FLG`, `MAP`, ...).
- [ ] Save/load (`save%02d.dat`, `save99.dat`).
- [ ] `.XA` audio decoder (voice/BGM/SE).
- [ ] `sprite.arc` / `.spt` / `.mtn` sprite animation.
- [ ] Map movement, party, encounter and battle systems.

## Next milestone

Play the full opening with audio: decode `.XA` voice/BGM, then implement
choices (`SLT`), flags (`IFT`/`FLG`/`EQU`) and scene loading (`LOD`/`SEND`).

The opening currently runs through `yr1_00.txt` and loads `yr1_01.txt`; it is
silent because DVD audio is stored as `.XA`.

## Notes / decisions

- Extracted files are ordinary `.bmp`/`.wav`/`.txt` where possible, so the
  player and debugging tools can use native browser support.
- The **UDF** DVD image is currently unpacked with 7-Zip. A small read-only UDF
  reader is a later task; it is not required for engine work.
- The shop-demo executable is the behavioral reference for the command VM; the
  DVD executable is the reference for the full command set and flag model.
- Assets are never committed. `data/` and `.cache/` are gitignored.
