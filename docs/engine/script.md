# Script language

Scenario scripts live in `text.arc` as CP932 `.txt` files. The engine also
loads external `.txt` scripts (the shop demo uses `mitamademo.txt`, named by
`mitama.ini`).

## Line syntax

- The file is **Shift-JIS / CP932**.
- A command line starts with `□` (U+25A1). `■` is accepted as well.
- Commands and numbers are written with **full-width** ASCII, e.g.
  `□ＢＭＰ　００＿１`. The parser normalizes U+FF01–U+FF5E to ASCII and the
  ideographic space to a normal space before splitting.
- `／／` (or `//`) starts a comment. Full lines only; the demo also contains
  commented-out commands.
- A command is `□COMMAND arg1 arg2 ...`.
- Any word that is not a known command is a **jump label**, e.g.
  `□デモスタート`, `□メインA`, `□勝利1`.
- Lines without `□` are dialogue/narration.

Dialogue uses Japanese quotation marks:

```text
説「八尋は瑞希を抱きしめると、
ゆっくりと体を倒していった。」
瑞「んんん…や、八尋様…あ…」
```

The part before `「` is the speaker token. `説` marks narration and is
normalized to an empty speaker, so no name tag is drawn. `￥` is a page break. Inline annotations such as `（ＹＲ１＿０２＿０１７４＿１）` or `（SE034）`
carry voice/SE cues. They are stripped from the displayed text and replayed
when the corresponding page is shown.

## Command table

The command vocabulary is stored as CP932 strings in `mitama_dvd.exe` at file
offset `0x181C8`:

```text
ＭＳＬＴ ＳＰＲＡＴＥ ＬＥＶＥＬ ＦＡＤＥ ＰＡＲＴＹ ＢＡＴＴＬＥ
ＳＨＡ ＴＩＴＬＥ ＥＱＵＦ ＷＩＮ ＳＴＳ ＥＶＴ ＬＯＤ ＳＥＶ ＲＮＤ
ＳＡＶ ＭＡＰ ＩＦＴ ＤＥＣ ＩＮＣ ＥＱＵ ＷＡＩＴ ＵＩＷ ＧＳＢ
ＵＰＤ ＭＵＳ ＢＭＰ ＪＭＰ ＦＣＫ ＳＬＴ ＥＮＤ ＦＬＧ
```

| Command | Arguments | Meaning | Status |
| --- | --- | --- | --- |
| `BMP` | `name [L\|R\|C] [消去]` | stage image; position and clear operators | ✅ |
| `UPD` | `クロス\|ワイプ\|ワイプ２\|上下\|円１\|円２` | transition to pending BMP | ✅ |
| `WAIT` | milliseconds | delay | ✅ |
| `MUS` | `name\|STOP` | BGM from `bgm.arc` (`.xa` decoded to WAV) | ✅ |
| `SEV` | `name [同]` | sound effect/voice; `同` reuses the channel | ✅ |
| `JMP` | `label` | jump | ✅ demo |
| `END` | — | end script | ✅ demo |
| `STS` | `text` | status/title label (e.g. `旅立`) | ✅ (logged) |
| `LOD` | `script` | load and run another scenario (`text.arc`) | ✅ |
| `SEND` / `SHAEND` | — | end a scene / menu block | ✅ (menu terminator) |
| `SLT` | quoted options with labels | single choice menu | ✅ |
| `MSLT` | quoted options with labels | multi-choice menu (single selection for now) | ✅ |
| `IFT` | `flag op value label`, `flag value label` | conditional jump (`> < =`) | ✅ |
| `EQU` | `flag value`, `flag = value` | assign flag | ✅ |
| `FLG` | `flag ON\|OFF`, `flag value` | set flag | ✅ |
| `INC` / `DEC` | `flag [step]` | flag increment/decrement | ✅ |
| `FCK` | `flag label`, `a & b & c label`, `flag ON\|OFF label` | flag check jump | ✅ |
| `RND` | `flag max` | random value into flag | ✅ |
| `SAV` | — | open save menu | ⛔ |
| `TITLE` | — | return to title | ⛔ |
| `MAP` | `ON\|OFF` | map-mode flag, saved in snapshots; movement UI pending | ◐ |
| `PARTY` | `IN\|OUT name` | add/remove party member | ◐ tracked |
| `BATTLE` | `background script` | battle screen or auto-resolve; sets flag `20` | ✅ simplified |
| `LEVEL` | `character stat value` | set/raise level (logged) | ◐ |
| `SPRATE` | — | sprite operation (name likely a typo for SPRITE) | ⛔ |
| `FADE` | milliseconds | fade screen | ⛔ |
| `SHA` | — | screen shake | ⛔ |
| `EVT` | — | event effect | ⛔ |
| `WIN` / `LOSE` | — | battle result branches | ⛔ |
| `EQF` | — | equipment flag | ⛔ |
| `UIW` / `GSB` | — | UI wait / game screen buffer | ⛔ |

The demo build only contains the first eight commands. The full DVD executable
contains the entire table above.

## Flags and control flow

`mitama_dvd.exe` contains diagnostic format strings that reveal the flag
model:

```text
flag%03d Off
flag%03d On
flag%03d = %d
flag%03d = flag%03d
flag%03d++
flag%03d--
jump %s
wait %d
```

Labels are global within a script. `LOD` transfers to another script; `SEND`
and `SHAEND` terminate the current script/scene.

Example (from `yr1_00.txt`):

```text
□ＳＴＳ　旅立
□ＢＭＰ　ＢＬＡＣＫ
□ＵＰＤ　クロス
□ＭＵＳ　Ｓ００１
説「文永捨壱年　文永の役￥
弘安四年　　弘安の役￥
弘安八年　　霜月騒動」
```

For the decoded story-level meaning of individual flags, route gates and
ending conditions, see [flags.md](flags.md).

## Asset routing

| Command | Archive |
| --- | --- |
| `BMP name` | `mitama.arc` / `sprite.arc` / `bagui.arc` (`name.bmp`) |
| `MUS name` | `bgm.arc` (`name.xa`) |
| `SEV name` | `se.arc`, `shinobi.arc`, `kunoichi.arc`, `kuno_EX.arc` (`name.xa`) |
| `LOD name` | `text.arc` (`name.txt`) |

Special BMP names: `BLACK`, `WHITE`, `RED`, `BG`, `ZZ`.

## Known unknowns

- Exact argument grammar of `MAP`, `SPRATE`, `UIW`, `GSB`, `EQF`, `SHA`.
- `FCK` flag-combination variants are handled as AND; `IFT` uses numeric
  equality/comparison.
- Whether `STS` sets the window title or an on-screen location label.
- The role of `￥` in dialogue, and line-wrapping widths.
- Battle data formats (`.chr`, `.pty`, `.dat`, `.mtn`, `.spt`, `.o`).
- Map hotspot/enemy tables and the full meaning of `MAP ON`.
- `.XA` is KWD1 audio, not the PSX XA format; the decoder is documented in
  [../formats/xa.md](../formats/xa.md).
