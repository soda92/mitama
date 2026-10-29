#!/usr/bin/env python3
"""Apply known scenario text corrections after extraction.

Some original scripts contain obvious copy/paste mistakes. Keep them here so a
fresh extraction can be repaired reproducibly without editing CP932 files by
hand.

Usage:
  python3 scripts/fix_scenario_typos.py
  python3 scripts/fix_scenario_typos.py --pack dvd --write
"""

from __future__ import annotations

import argparse
from pathlib import Path

# scene -> [(wrong text, corrected text)]
FIXES: dict[str, list[tuple[str, str]]] = {
    "oh4_13": [
        (
            "□ＳＥＶ　ＯＳ４＿０８＿００２１\n阿「ま…まさか…素戔鳴…」",
            "□ＳＥＶ　ＯＳ４＿０８＿０２２８\n阿「ま…まさか…素戔鳴…」",
        ),
    ],
    # Extra/missing zeroes in otherwise valid voice IDs.
    "oe4_02": [
        ("□ＳＥＶ　ＯＳ２＿０８＿００４０３", "□ＳＥＶ　ＯＳ２＿０８＿０４０３"),
    ],
    "os4_09": [
        ("□ＳＥＶ　ＯＳ４＿０８＿００１５５", "□ＳＥＶ　ＯＳ４＿０８＿０１５５"),
    ],
    "os3_19": [
        ("□ＳＥＶ　ＯＳ３＿１＿０００３", "□ＳＥＶ　ＯＳ３＿０１＿０００３"),
    ],
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="./data")
    parser.add_argument("--pack", default="dvd")
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    root = Path(args.data) / args.pack / "text"
    total = 0
    for scene, replacements in FIXES.items():
        path = root / f"{scene}.txt"
        if not path.exists():
            print(f"skip {path}: not found")
            continue
        with path.open("r", encoding="cp932", newline="") as handle:
            text = handle.read()
        changed = 0
        for old, new in replacements:
            # Match both CRLF and LF files without changing their line endings.
            for newline in ("\r\n", "\n"):
                old_text = old.replace("\n", newline)
                new_text = new.replace("\n", newline)
                count = text.count(old_text)
                if count:
                    text = text.replace(old_text, new_text)
                    changed += count
                    break
        if changed:
            total += changed
            print(f"{path}: {changed} correction(s)")
            if args.write:
                with path.open("w", encoding="cp932", newline="") as handle:
                    handle.write(text)
        else:
            print(f"{path}: already clean")

    if total and not args.write:
        print("dry run; rerun with --write")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
