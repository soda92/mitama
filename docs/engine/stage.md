# Stage and image composition

The engine composites a small scene graph per command frame:

```text
background stack  (BMP, normally 640×480; later entries draw on top)
  ├── left stand   (L)
  ├── right stand  (R)
  └── center stand (C)
```

`BMP BLACK`, `BMP WHITE` and `BMP RED` push a full-screen color layer onto the
background stack. `BMP BLACK 消去` removes the matching layer and reveals the
background underneath; it does **not** clear the stage. This is used for black
flashes and white fades.

The stage is composed at **3× logical resolution** (1920×1440) so HD stand
assets are not discarded before the final canvas. A 336×480 character stand
occupies its logical size, bottom-aligned:

| Slot | Position |
| --- | --- |
| `L` | `x = 0` |
| `R` | `x = 640 - width` |
| `C` | `x = (640 - width) / 2` |

All stand slots use `y = 480 - height`.

## BMP commands

```text
□BMP BG012              # background
□BMP T02_2 L            # left character stand
□BMP T03_1 R            # right character stand
□UPD クロス              # transition to the accumulated back buffer
```

`BMP` edits a **pending** stage; `UPD` composites and transitions from the
current stage to the pending stage. Multiple `BMP` commands can be issued
before one `UPD` (this is how both characters appear together).

Clear operators:

- `BMP ALL 消去` — clear the whole stage, including the background stack.
- `BMP T02_2 L 消去` — remove the left layer.
- `BMP BLACK 消去` / `BMP WHITE 消去` — remove that color layer and reveal the
  background underneath.

Full-screen images (CGs, backgrounds) are 640×480 and are pushed onto the
background stack. A new CG replaces the previous CG layer while preserving the
base background underneath; `BMP CG… 消去` therefore reveals the normal scene,
not an earlier CG. Background changes clear character slots; scripts then add
the stands for the new scene.

## Transparency

Character stand BMPs are 24-bit images with a **black key background**.
The player builds a per-sprite canvas at render resolution and clears
border-connected near-black pixels (RGB channels ≤ 12). Interior near-black
pixels are preserved for outlines. This is why the background is visible
around the characters instead of the sprite's black rectangle.

`hd` and `hd4` PNG replacements use the same base names. They are composited
at 3× logical resolution first, then scaled back through `scale.json`; the
renderer prefers 4×, then 2×, then the original BMP.

## Save snapshots

A save records the stage as names:

```json
{ "bg": "BG012", "bgs": ["BLACK", "BG012"], "l": "T02_2", "r": "T03_1" }
```

Loading a save resolves those names through the asset map and rebuilds the
same composition before resuming at the saved command.
