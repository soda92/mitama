# AI sprite/background upscaling

Last updated: 2026-10-25.

The original game art is 640×480; character stands are typically 320×480 or
352×480. Rendering them on a modern 1764×1322 physical stage enlarges each
source pixel about 2.7×. Canvas smoothing can hide the stair-steps but cannot
create detail.

The practical fix is to pre-upscale the source art with an AI upscaler and use
the larger images at runtime. HD files live alongside the extracted data and
are ignored by git:

```text
data/dvd/hd/        2× stands
  scale.json
  mitama/T02_5.png
  ...
data/dvd/hd4/       4× stands (higher priority)
  scale.json
  mitama/T02_5.png
```

The server includes these in `/api/assets` as `hd` and `hd4`. The renderer
tries, in order:

1. `hd4` (4×)
2. `hd` (2×)
3. original BMP

It scales the selected image back to the original logical size using the
layer's `scale.json`.

## Hardware

This laptop is sufficient:

- Intel i5-13500H (12 cores / 16 threads)
- 15 GB RAM
- Intel Iris Xe Graphics
- Vulkan 1.4 available
- 90 GB free disk

No NVIDIA/CUDA is needed. `waifu2x-ncnn-vulkan` runs through Vulkan on Iris Xe.
A 352×480 sprite at 2× took about 3–9 seconds in testing.

## Install

Arch Linux:

```sh
sudo pacman -S waifu2x-ncnn-vulkan
```

The command supports Intel/AMD/NVIDIA through Vulkan:

```sh
waifu2x-ncnn-vulkan -i input.png -o output.png -s 2 -n 0 -g 0 -f png
```

## Run

Start with character stands and backgrounds:

```sh
python3 scripts/upscale_assets.py \
  --pattern 'mitama/T*.bmp' \
  --pattern 'mitama/BG*.bmp' \
  --scale 2 \
  --skip-existing
```

Other useful patterns:

```sh
# backgrounds only
python3 scripts/upscale_assets.py --pattern 'mitama/BG*.bmp' --scale 2

# CGs
python3 scripts/upscale_assets.py --pattern 'mitama/CG*.bmp' --scale 2

# 4x character stands (writes hd4/)
python3 scripts/upscale_assets.py \
  --pattern 'mitama/T*.bmp' \
  --scale 4 \
  --out-dir hd4 \
  --skip-existing

# test one file
python3 scripts/upscale_assets.py --pattern 'mitama/T02_5.bmp' --scale 2

# estimate without invoking the upscaler
python3 scripts/upscale_assets.py --pattern 'mitama/T*.bmp' --dry-run
```

The script:

1. Converts BMP to PNG.
2. Runs waifu2x with noise level 0 and the requested scale.
3. Writes PNGs under `data/dvd/hd/` with the same directory layout.
4. Writes `data/dvd/hd/scale.json` for the renderer.

Resume with `--skip-existing`.

## Scale choice

- **2×** — recommended for the current 4:3 stage; sprites become 704×960,
  backgrounds 1280×960. Output goes to `hd/`.
- **4×** — better for high-DPI/zoomed viewing, but roughly 4× slower and larger
  (about 1.4 MB per stand). Output goes to `hd4/`; the renderer prefers it.
- Keep the original BMPs; the renderer falls back to `hd4` → `hd` → BMP.

## Sprites and transparency

The stand BMPs use a black background, not an alpha channel. The upscaler keeps
that black background; the renderer's existing border-connected chroma key
removes it at load time. If you later pre-multiply alpha into HD PNGs, the
renderer will use the PNG alpha and the chroma key will leave transparent
pixels alone.

The remaining dark fringe is partly in the original art/black anti-aliasing.
For a more polished result, add an alpha-matte/edge-feather step after
upscaling.

## Why not just increase canvas resolution?

The canvas already renders at `640×480 × 3`. That only gives the browser more
pixels to interpolate; it cannot restore lines, hair strands or cloth detail
that are absent from the 320×480 source. AI upscaling is the only way to add
plausible detail.
