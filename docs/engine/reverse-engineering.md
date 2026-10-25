# Reverse engineering notes

Last updated: 2026-10-25.

This page is the durable index for Ghidra work on `mitama_dvd.exe`. It exists
because the binary is not committed and prior one-off analysis can otherwise be
lost. Keep the Ghidra project/scripts in `tools/ghidra/`, and write conclusions
here with addresses, call paths and caveats.

## Binary layout

The DVD build is a PE32 i386 executable with image base `0x400000`:

| Section | Range |
| --- | --- |
| `.text` | `0x00401000..0x0048e484` |
| `.rdata` | `0x0048f000..0x00499d12` |
| `.data` | `0x0049a000..0x004a9000` |
| `.rsrc` | `0x004fe000..0x004ff803` |

The extracted executable is at `.cache/dvd/mitama_dvd.exe` and is ignored by
git.

## Ghidra workflow

Import once:

```sh
mkdir -p /tmp/mitama-ghidra
/opt/ghidra/support/analyzeHeadless /tmp/mitama-ghidra mitama \
  -import .cache/dvd/mitama_dvd.exe \
  -analysisTimeoutPerFile 300
```

Process the existing project with one of the helpers:

```sh
/opt/ghidra/support/analyzeHeadless /tmp/mitama-ghidra mitama \
  -process mitama_dvd.exe \
  -noanalysis \
  -scriptPath tools/ghidra \
  -postScript FindSceneRefs.java eyk2_03.txt eoa4_07.txt yk2_03.txt
```

Available scripts:

- `tools/ghidra/FindSceneRefs.java` — find ASCII strings, pointer-table
  occurrences and direct xrefs.
- `tools/ghidra/FindCallers.java` — list callers/xrefs for function entries.
- `tools/ghidra/FindRefsInRange.java` — list references into an address range.
- `tools/ghidra/DumpAt.java` — print the containing function and decompiler
  output for an address.

## Script/scene loading pipeline

The following call path is the important one for story scenes:

```text
FUN_0043f170  main game loop / script runner
  FUN_00432dc0  load and parse a .txt scenario
  FUN_00432030  command dispatcher
    case 0x17  LOD handler
      FUN_004387d0  append ".txt" and call FUN_00432dc0
```

Addresses:

| Address | Meaning |
| --- | --- |
| `0x0043f170` | main scene/game loop. Starts `yr1_00.txt` for 八尋 or `os1_00.txt` for 朧. |
| `0x00432dc0` | scenario loader. Opens `text.arc`/external `.txt`, reads and splits lines into the command table. |
| `0x00432030` | numeric command dispatcher. `DAT_004b1520` selects the handler. |
| `0x004387d0` | `LOD` path. Reads the command argument, appends `.txt`, then calls `FUN_00432dc0`. |
| `0x00443740` | save-slot loader (`save%02d.dat`), not a general scene loader. |

Implication: in the shipped script VM, a new scenario is entered through the
initial route, a save slot, or an explicit `LOD` argument. There is no separate
"event scene" auto-loader in this path.

## The `e…` scenes

There are 42 `e*.txt` scenarios in the DVD data. They are not ordinary story
chapters:

- every one ends with `□ＴＩＴＬＥ`;
- none contains a `LOD` or `JMP`;
- no story script contains any `e…` scene name;
- Ghidra finds the names in static data, but no direct code xrefs to their
  pointer entries.

For example:

```text
eyk2_03.txt  string @ 0x0049fc94
             data pointer @ 0x0048fbf4
             direct code xrefs: none
eoa4_07.txt  string @ 0x0049f69c
             data pointer @ 0x0049047c
             direct code xrefs: none
```

`FindRefsInRange` over the CG/event metadata area
`0x0048f000..0x00490600` reports only a single data pointer at
`0x0048f074 -> 0x0040185c` (a thunk), not a code path into the e-scene
entries. This is why the conclusion is "not reachable from the story VM in
this build", not "e-scenes are definitely story bonus branches".

The surrounding static data pairs CG filenames (e.g. `CGX_a15.bmp`) with the
`e…` scripts. It is consistent with a CG/event gallery table, not with a story
branch table. The current web runtime exposes those scripts through the Gallery
and direct `?scene=` links; the story VM will not enter them automatically.

This is why being at `yk2_13` does not mean `eyk2_03` was missed. The numbering
is a separate namespace, and `yk2_13` contains no `LOD EYK2_03`.

The caveat is that the static table is not directly referenced by the story
dispatcher. If the original executable has a gallery/event launcher, it is not
wired through `FUN_00432030`; it would need a separate title/gallery path. Do
not assume a `e…` scene is reachable in-game until such a path is found.

### They are story-adjacent, but not story branches

This is why the “e” content feels like part of the story: many entries are
event/CG replays of a scene that exists in a normal story script. A concrete
example:

- `yk2_03` contains the Shihou scene, including the CG sequence `CGH_a01`,
  `CGH_a01_1`, `CGH_a01_2`.
- `eyk2_03` starts with the same “紫芳 removes her sash” text, uses the same
  voice cues and the same three CGs, then ends at `TITLE`.
- The CG table entry near `0x0048fbec` points at `CGH_a01s.bmp` and
  `0x0048fbf4` points at `eyk2_03.txt`.

So `eyk2_03` is a **standalone replay/event version** of a CG event that also
appears in the story. It is not a `LOD` target at `yk2_03` or `yk2_13`, and it
does not continue into the Kureha route. The same pattern appears for other
`e…` scripts; some contain explicit material that is not in the base scene,
which is why they read like bonus content.

If a future investigation finds the original title/gallery launcher, that
launcher can load these scenes without changing the story dispatcher. Until
then, keep them separate from the route graph in the web UI.

## Reproducing the e-scene check

Search all decoded scripts for `LOD`/`JMP` targets and compare against the
`e*.txt` set:

```sh
python3 - <<'PY'
from pathlib import Path
import unicodedata
norm = lambda s: unicodedata.normalize('NFKC', s).lower()
names = {p.stem.lower() for p in Path('data/dvd/text').glob('e*.txt')}
refs = {name: [] for name in names}
for p in Path('data/dvd/text').glob('*.txt'):
    text = p.read_text(encoding='cp932', errors='replace')
    for line_no, line in enumerate(text.splitlines(), 1):
        line = norm(line)
        for name in names:
            if name in line:
                refs[name].append((p.stem, line_no, line.strip()))
print({name: refs[name] for name in sorted(names) if refs[name]})
PY
```

Result: no references.

## Battle work

Battle extraction/format notes belong in [battle.md](battle.md). When doing new
battle reverse engineering:

1. find the battle loader function with `FindCallers.java`;
2. identify the file names/formats passed to it;
3. decompile with `DumpAt.java`;
4. record addresses and the interpreter's expected fields here before moving on.

Do not leave conclusions only in a chat transcript.
