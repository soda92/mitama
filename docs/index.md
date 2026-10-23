# Mitama web engine

This book documents the reverse engineering and implementation of a web
runtime for **御魂 ～忍～ / Mitama ~Shinobi~**, the 2001 adventure/RPG by Ciel
built on the company's in-house **ARCANA** engine.

## Why this is possible

The DVD-ROM edition ships the engine as a single 745 KB Win32 executable,
`mitama_dvd.exe`, together with uncompressed-ish ARC archives. The executable
retains enough readable strings, command names and code to identify:

- the ARC directory obfuscation key (`arcana`);
- the LZSS codec and `KWD1` container;
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
  pkg/arc ─── directory decode + KWD1 + LZSS
        │
        ├──► cmd/extract ──► data/<pack>/<archive>/<file>
        │
        └──► cmd/server ──► /api + /media ──► web-app (React + canvas)
```

The extractor writes ordinary files, which makes format work and debugging
simple. The server only serves what is under `data/`, so the original disc is
never modified.

## Current milestone

A playable reconstruction of the **shop demo**: image changes, cross/wipe/circle
transitions, BGM, sound effects, voice clips and the script's `JMP` loop.
The full game's asset set already extracts, but its script VM (map, party,
battle, text) is still under construction.

Start with [Progress](progress.md).
