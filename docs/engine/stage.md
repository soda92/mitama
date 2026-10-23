# Stage and image composition

The engine composites a small scene graph per command frame:

```text
background  (BMP, normally 640×480)
  ├── left stand   (L)
  ├── right stand  (R)
  └── center stand (C)
```

Images are **not scaled**. A 336×480 character stand is drawn at its natural
size, bottom-aligned:

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

- `BMP ALL 消去` — clear the whole stage.
- `BMP T02_2 L 消去` — remove the left layer.
- `BMP BLACK 消去` / `BMP WHITE 消去` — clear to black.

Full-screen images (`BLACK`, `WHITE`, `RED`, CGs, backgrounds) are 640×480 and
replace the background. Background changes clear character slots; scripts then
add the stands for the new scene.

## Transparency

Character stand BMPs are 24-bit images with a **pure-black key background**.
The player builds a per-sprite canvas and sets `alpha = 0` for pixels whose
RGB is exactly `(0,0,0)`. Near-black edge pixels are kept to preserve outlines.
This is why the background is visible around the characters instead of the
sprite's black rectangle.

## Save snapshots

A save records the stage as names:

```json
{ "bg": "BG012", "l": "T02_2", "r": "T03_1" }
```

Loading a save resolves those names through the asset map and rebuilds the
same composition before resuming at the saved command.
