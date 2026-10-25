# Mitama web engine

This book documents the reverse engineering and implementation of a web
runtime for **御魂 ～忍～ / Mitama ~Shinobi~**, the 2001 adventure/RPG by Ciel
built on the company's in-house **ARCANA** engine.

## Why this is possible

The DVD-ROM edition ships the engine as a single 745 KB Win32 executable,
`mitama_dvd.exe`, together with uncompressed-ish ARC archives. The executable
retains enough readable strings, command names and code to identify:

- the ARC directory obfuscation key (`arcana`);
- the LZSS codec (images/text) and the KWD1 audio codec;
- the script command vocabulary (`BMP`, `UPD`, `SLT`, `IFT`, `MAP`, `BATTLE`,
  …);
- the fixed 640×480 display and 24-bit BMP image pipeline.

The shop-demo executable (`mitama.exe`, 118 KB) and its script
(`mitamademo.txt`) are a compact, self-contained reference implementation of
the same command VM. The web player is being grown from that demo upward.

## Architecture

```text
disc image (ISO/CCD/MDF)
        │
        ▼
  pkg/disc ── ISO 9660 / raw-sector mapping
        │
        ▼
  pkg/arc ─── directory decode + LZSS;  pkg/xa ─── KWD1 audio
        │
        ├──► cmd/extract ──► data/<pack>/<archive>/<file>
        │
        └──► cmd/server ──► /api + /media ──► web-app (React + canvas)
```

The extractor writes ordinary files, which makes format work and debugging
simple. The server only serves what is under `data/`, so the original disc is
never modified. Archive saves are stored separately in
`data/mitama-saves.db` (SQLite); the browser keeps a local cache.

## Current milestone

The DVD opening and first chapter are playable with backgrounds, dialogue,
choices, BGM, sound effects and voice. Scene links (`?scene=...&cmd=...`),
archives, the page/chapter navigator and docked side panels work. Flags, party
and map-mode state are tracked. `.pty`/`.chr` battles are parsed and playable in
a simplified screen. Real map movement, battle motions, specials and the full
damage model remain.

Start with [Progress](progress.md).

Battle file details: [engine/battle.md](engine/battle.md).
Gallery data and seen-state details: [engine/gallery.md](engine/gallery.md).
Story flags, route gates and ending conditions: [engine/flags.md](engine/flags.md).
