#!/usr/bin/env python3
"""Repair partially translated entries in data/<pack>/translations.json.

The batch translator sometimes receives a partially translated page (some
source lines remain Japanese). This script re-translates the affected text one
source line at a time, which is slower but avoids leaving Japanese chunks in
the English output.

Usage:
  python3 scripts/repair_translations.py --pack dvd
  python3 scripts/repair_translations.py --pack dvd --limit 100
"""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

JP = re.compile(r"[\u3040-\u30ff\u3400-\u9fff]")
BASE = "https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=ja&tl=en"


def translate_batch(texts: list[str], retries: int = 6) -> list[str]:
    params = [("client", "dict-chrome-ex"), ("sl", "ja"), ("tl", "en")]
    params += [("q", text) for text in texts]
    url = "https://clients5.google.com/translate_a/t?" + urllib.parse.urlencode(params)
    last: Exception | None = None
    for attempt in range(retries):
        try:
            request = urllib.request.Request(
                url,
                headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"},
            )
            with urllib.request.urlopen(request, timeout=45) as response:
                raw = json.loads(response.read().decode("utf-8"))
            if len(raw) != len(texts):
                raise RuntimeError(f"got {len(raw)} results for {len(texts)} inputs")
            return [str(item) for item in raw]
        except Exception as error:  # noqa: BLE001
            last = error
            if attempt + 1 < retries:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"translation failed: {last}")


def split_pages(source: str) -> list[str]:
    return re.split(r"[￥¥]", source)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="./data")
    parser.add_argument("--pack", default="dvd")
    parser.add_argument("--batch", type=int, default=50)
    parser.add_argument("--sleep", type=float, default=0.4)
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    path = Path(args.data) / args.pack / "translations.json"
    file = json.loads(path.read_text(encoding="utf-8"))
    jobs: list[tuple[str, int, str, int, int, str]] = []
    plans: dict[tuple[str, int], list[list[str]]] = {}

    for scene, entries in sorted(file["scenes"].items()):
        for pc_key, entry in sorted(entries.items(), key=lambda item: int(item[0])):
            if not entry.get("text") or not JP.search(entry["text"]):
                continue
            pages = split_pages(entry.get("source", ""))
            plan: list[list[str]] = []
            for page_index, page in enumerate(pages):
                lines = page.split("\n")
                plan.append(["" if not line.strip() else "__UNTRANSLATED__" for line in lines])
                for line_index, line in enumerate(lines):
                    if line.strip():
                        jobs.append((scene, int(pc_key), "text", page_index, line_index, line.strip()))
            plans[(scene, int(pc_key))] = plan

            for source, translated in (entry.get("options") or {}).items():
                if translated and JP.search(translated):
                    jobs.append((scene, int(pc_key), "option", 0, 0, source))

    if args.limit:
        jobs = jobs[: args.limit]

    print(f"repairing {len(jobs)} source lines across {len(plans)} text entries")
    for start in range(0, len(jobs), args.batch):
        batch = jobs[start : start + args.batch]
        texts = [job[5] for job in batch]
        translated = translate_batch(texts)
        for job, value in zip(batch, translated):
            scene, pc, kind, page, line, _ = job
            entry = file["scenes"][scene][str(pc)]
            if kind == "option":
                entry.setdefault("options", {})[job[5]] = value
            else:
                plans[(scene, pc)][page][line] = value
        # Rebuild only entries whose lines have all arrived.
        rebuilt = 0
        for (scene, pc), plan in plans.items():
            if any("__UNTRANSLATED__" in line for page in plan for line in page):
                continue
            entry = file["scenes"][scene][str(pc)]
            entry["text"] = "￥".join("\n".join(lines) for lines in plan)
            rebuilt += 1
        path.write_text(json.dumps(file, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{min(start + args.batch, len(jobs))}/{len(jobs)} lines, {rebuilt} entries rebuilt", flush=True)
        time.sleep(args.sleep)

    remaining = 0
    for entries in file["scenes"].values():
        for entry in entries.values():
            if entry.get("text") and JP.search(entry["text"]):
                remaining += 1
            for translated in (entry.get("options") or {}).values():
                if translated and JP.search(translated):
                    remaining += 1
    print(f"remaining entries with Japanese characters: {remaining}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
