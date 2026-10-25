#!/usr/bin/env python3
"""AI-upscale selected game images into data/<pack>/hd/.

Requires:
  - ImageMagick (`magick`)
  - waifu2x-ncnn-vulkan (or set --tool to another compatible ncnn CLI)

Examples:
  python3 scripts/upscale_assets.py --pattern 'mitama/T*.bmp'
  python3 scripts/upscale_assets.py --pattern 'mitama/BG*.bmp' --scale 2
  python3 scripts/upscale_assets.py --pattern 'mitama/CG*.bmp' --skip-existing
"""

from __future__ import annotations

import argparse
import glob
import subprocess
import sys
import tempfile
import time
from pathlib import Path


def run(cmd: list[str]) -> None:
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd)}\n{proc.stdout}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="./data")
    parser.add_argument("--pack", default="dvd")
    parser.add_argument("--pattern", action="append", default=None,
                        help="glob relative to <data>/<pack>; repeatable")
    parser.add_argument("--scale", type=int, default=2, choices=[2, 4])
    parser.add_argument("--tool", default="waifu2x-ncnn-vulkan")
    parser.add_argument("--gpu", default="0")
    parser.add_argument("--skip-existing", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    root = Path(args.data) / args.pack
    patterns = args.pattern or ["mitama/T*.bmp", "mitama/BG*.bmp"]
    inputs: list[Path] = []
    for pattern in patterns:
        inputs.extend(Path(p) for p in glob.glob(str(root / pattern)))
    inputs = sorted(set(inputs))
    if not inputs:
        print("no inputs matched", file=sys.stderr)
        return 1

    missing = [cmd for cmd in ("magick", args.tool) if not Path(cmd).exists() and not shutil_which(cmd)]
    if missing:
        print(f"missing tools: {', '.join(missing)}", file=sys.stderr)
        return 2

    if not args.dry_run:
        (root / "hd").mkdir(parents=True, exist_ok=True)
        (root / "hd" / "scale.json").write_text(
            '{"scale": %d}\n' % args.scale, encoding="utf-8"
        )

    started = time.time()
    done = 0
    skipped = 0
    for idx, src in enumerate(inputs, 1):
        rel = src.relative_to(root)
        out = root / "hd" / rel.with_suffix(".png")
        if args.skip_existing and out.exists():
            skipped += 1
            continue
        print(f"[{idx}/{len(inputs)}] {rel} -> {out.relative_to(root)}", flush=True)
        if args.dry_run:
            continue
        out.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="mitama-upscale-") as tmp:
            tmp_in = Path(tmp) / "in.png"
            run(["magick", str(src), str(tmp_in)])
            run([
                args.tool,
                "-i", str(tmp_in),
                "-o", str(out),
                "-s", str(args.scale),
                "-n", "0",
                "-g", args.gpu,
                "-f", "png",
            ])
        done += 1

    if not args.dry_run:
        (root / "hd").mkdir(parents=True, exist_ok=True)
        (root / "hd" / "scale.json").write_text(
            '{"scale": %d}\n' % args.scale, encoding="utf-8"
        )

    elapsed = time.time() - started
    print(f"done={done} skipped={skipped} elapsed={elapsed:.1f}s scale={args.scale}x")
    return 0


def shutil_which(command: str) -> str | None:
    # Local helper so the script stays self-contained on minimal installs.
    import shutil
    return shutil.which(command)


if __name__ == "__main__":
    raise SystemExit(main())
