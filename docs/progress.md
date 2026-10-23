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

## In progress

- [ ] End-to-end Playwright smoke test.
- [ ] Text rendering: dialogue box, speaker names, wrapping, click-to-advance.
- [ ] Full-game script commands (`SLT`, `IFT`, `FLG`, `LOD`, `MAP`, ...).
- [ ] Save/load (`save%02d.dat`, `save99.dat`).
- [ ] `.XA` audio decoder (voice/BGM/SE).
- [ ] `sprite.arc` / `.spt` / `.mtn` sprite animation.
- [ ] Map movement, party, encounter and battle systems.

## Next milestone

Boot `yr1_00.txt` (the opening) from the DVD data and play through it with
dialogue, images, music and voice.

Why `yr1_00.txt`: it is one of the two opening scripts (`yr1_00`, `os1_00`)
and is present at the root of `text.arc`; the executable also has both names
hard-coded.

## Notes / decisions

- Extracted files are ordinary `.bmp`/`.wav`/`.txt` where possible, so the
  player and debugging tools can use native browser support.
- The **UDF** DVD image is currently unpacked with 7-Zip. A small read-only UDF
  reader is a later task; it is not required for engine work.
- The shop-demo executable is the behavioral reference for the command VM; the
  DVD executable is the reference for the full command set and flag model.
- Assets are never committed. `data/` and `.cache/` are gitignored.
