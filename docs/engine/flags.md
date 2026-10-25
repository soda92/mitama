# Story flags and branching

Last updated: 2026-10-25.

This document describes the numeric variables used by the scenario scripts, how
they change story flow, and which flags are known well enough to document. It is
a map of the current understanding, not a complete decompilation of every
condition in all 420 scripts.

## The variable model

The scripts do not use named variables. Every story variable is a numbered
**flag** with an integer value. The player stores them in a map:

```ts
flags: Map<number, number>
```

An unset flag reads as `0`. Values are usually small integers:

- `0` / `1` — boolean
- `1` / `2` / `3` — enum or route state
- `0..3` — counter or progress step
- larger values — counters such as affection or loss counts

The full DVD scripts reference 87 distinct flag IDs in the range `0..145`.
Not all of them have been decoded, and scripts sometimes reuse the same numeric
flag for different purposes in different routes.

## Commands that read or write flags

| Command | Meaning | Effect |
| --- | --- | --- |
| `FLG id ON` / `OFF` | Set boolean | `1` / `0` |
| `FLG id value` | Set numeric value | `value` |
| `EQU id value` | Assign | `value` |
| `INC id [n]` | Increment | `old + n` (default `1`) |
| `DEC id [n]` | Decrement | `old - n` (default `1`) |
| `RND id max` | Random | `0 .. max-1` |
| `IFT id op value label` | Test | Jump if comparison is true |
| `FCK id label` | Test nonzero | Jump if flag is not `0` |
| `FCK a & b & c label` | Combined test | Jump if all are nonzero |
| `FCK id ON label` | Boolean test | Jump if flag is not `0` |
| `FCK id OFF label` | Boolean test | Jump if flag is `0` |

`IFT` supports `=`, `>` and `<`. `FCK` is effectively `!= 0`, not a bitwise
test. A role such as “flag 25 is the Ran ending flag” therefore means “25 is
nonzero”, not “bit 25 of a bitfield”.

The only implicit story write is:

```text
BATTLE background script
```

The battle result is written to **flag 20**:

- `20 = 1` — win
- `20 = 0` — lose

Scripts immediately branch on it:

```text
□BATTLE BGB02 YR0_02
□IFT 20 = 00 敗北
□IFT 20 = 01 勝利
```

## What flags mean for story flow

Flags control five different kinds of story behavior.

### 1. Boolean event gates

A flag records whether a scene, conversation, item or optional event happened.
Later scripts check it to add or remove dialogue/scenes:

```text
□FLG 37 ON          // Sarasa is no longer a virgin
...
□IFT 37 = 01 非処女
```

### 2. Route state

Some flags record which branch the player is on, or which companion is present.
They select different `LOD` targets or jump to different labels. Example from
`os3_19`:

```text
□FCK 96 朧諏慧姫編へ
□JMP 更紗編4章へ
```

If flag `96` is set, the script enters the Oboro/Suikihime branch; otherwise it
continues into the Sarasa chapter 4 branch.

### 3. Affection and condition counters

`INC`/`DEC` accumulate values, and a later `IFT` or `FCK` decides whether the
player qualifies for a scene or ending:

```text
□INC 89            // Suikihime affection +
...
□IFT 89 > 01 諏慧姫エンディング
```

Several of these ending checks are commented out in the source scripts. Where
that is the case, the current data does not actually enforce the condition.
The occurrence of `89` still shows the intended model.

### 4. Encounter and battle state

`RND`/`IFT` are used for random encounters. For example:

```text
□RND 09 100
□IFT 09 > 70 勝利1
```

This is not a permanent story choice; it is a per-encounter roll. Battle
outcomes use flag `20`.

### 5. Map progress

Flags `10`–`13` are map-screen registers. They are assigned before `MAP ON`
and describe the current map position/route state. The web runtime currently
tracks only the separate `MAP ON/OFF` boolean; it does not yet use `10`–`13` for
free movement. Map destinations and encounters are still driven by scripted
jumps and choices.

## Route and ending gates

### Main protagonist selection

This is not flag-based. The title screen starts one of two scripts:

- 八尋 → `yr1_00`
- 朧 → `os1_00`

The selected route is now stored in archive snapshots as `protagonist`, and it
is also derivable from the scene prefix.

### Character branches inside the routes

These are direct `LOD`/choice branches, not flag conditions:

| Scene | Choice | Result |
| --- | --- | --- |
| `yr1_11` | “わかった...一緒に行こう” | `LOD YK1_01` (紅羽編) |
| `os1_19` | “わかった...結界のこともわからないし...” | `LOD OH1_01` (紫芳編) |
| `os2_14` | “わかった...ついてこい” | `LOD OA2_01` (阿佐弥編) |
| `yk2_12` | 瑞希を連れて行く → 紅羽を伊勢まで送る | `PARTY OUT 紅羽` / `PARTY IN 瑞希` → `LOD YM2_02` (瑞希編) |

`yk2_12` is a two-stage gate. Refusing to take Mizuki (or taking her and then
choosing to send her to Taima) continues the Kureha route at `YK2_13`. Only
“take Mizuki” followed by “send Kureha to Ise” switches to the Mizuki route.

Rejecting these choices continues the main route.

### Oboro / Suikihime / Sarasa split

`os3_19` sets flag `96` when 朧 defeats 八尋’s team in the chapter 3 battle,
then checks it later:

```text
□FCK 96 朧諏慧姫編へ
□JMP 更紗編4章へ
```

- `96 != 0` — the 朧-諏慧姫 route
- `96 == 0` — the 更紗 chapter 4 branch

Flag `96` is also checked during the mirror acquisition in chapter 4.

### 八尋 / 蘭 ending

`yr4_07` records the final choice in flag `25`:

```text
「ああ...」          → YR4_07A → □FLG 25 ON
「蘭...やめよう」    → YR4_07B → □FLG 25 OFF
```

Then `yr4_14` checks it:

```text
□IFT 25 = 00 ロンリーEND
```

- `25 == 0` — lonely ending
- `25 != 0` — 蘭 ending

### 諏慧姫 ending checks

The route scripts contain intended gates based on:

- `21`, `22`, `23` — 珠, 剣, 鏡
- `89` — 諏慧姫 affection
- `96` — prior battle against 八尋’s team (mirror/branch condition)
- `111` — who accompanied 諏慧姫

Examples include `FCK 21 & 22 & 23` and `IFT 89 > 01`. Some of these checks are
commented out in the shipped scripts (notably in `oe4_10`), so treat them as
intended conditions rather than guaranteed current behavior.

### 更紗 ending

`os4_14` contains a comment for a 更紗 ending condition check, but the actual
`IFT 89 < 15` line is commented out. The script currently proceeds into the
Sarasa ending material unconditionally unless another later condition redirects
it.

## Known flag reference

`?` means the role is inferred or only partly understood. All flags are
route-local in practice: the same number can mean different things in different
routes.

| Flag(s) | Known role |
| --- | --- |
| `9` | Random encounter roll (`RND 09 100`; thresholds 50/70/75) |
| `10`–`13` | Map-screen position/route registers set before `MAP ON`; not yet used for movement |
| `15` | “Second time”/repeat-scene marker in some 八尋/紅羽 scenes; exact semantics unresolved |
| `20` | Last battle result: `1` win, `0` loss |
| `21` | 珠 / jewel |
| `22` | 剣 / sword |
| `23` | 鏡 / mirror |
| `25` | 蘭 ending flag; set by the final choice in `yr4_07` |
| `31`–`36` | 八尋 chapter 1/2 progression, search counters and branch state; `35` is a 蘭 intimacy flag; `36` is also used for the 阿佐弥 meeting in the 朧 route |
| `37` | 更紗 virginity (`1` = no longer a virgin) |
| `38` | 八尋 chapter 1 branch marker |
| `39` | 瑞希 rescue failure / battle loss state |
| `40` | 熱田/蘭-route progress marker |
| `41` | Encountered 八尋’s team (朧 route) |
| `42` | 瑞希-lookalike event seen (八尋 route); cuts later 瑞希 interactions |
| `43` | 紫芳’s sword / three-monkeys victory state |
| `44` | Talisman received from 瑞希 |
| `45` | 八尋 chapter 4 battle loss count |
| `46` | 八尋 chapter 1 branch (`16`/`17`) |
| `48` | 八尋’s affection for 蘭: `1` like, `2` normal, `3` dislike |
| `53`–`55` | 紅羽 chapter 2 conversation topics; combinations gate dialogue |
| `56`–`60` | 紅羽 chapter 1/2 companion and scene flags |
| `62`–`63` | 紅羽 route battle failure/branch flags |
| `65`–`66` | 紅羽 rescue/search progress |
| `67` | 紅羽 route battle branch |
| `69` | 紅羽 route “separate party” state |
| `70` | 瑞希-lookalike/woodcutter encounter state; affects 紅羽 chapter 3 |
| `71` | 朧 chapter 2 direction-selection state (supports backtracking) |
| `74` | 瑞希 visited 伊勢 |
| `75` | 瑞希 visited 木曾 |
| `76` | 伊勢 visited |
| `77` | 當麻 visited |
| `78` | 木曾 visited |
| `79` | 京 visited |
| `80` | 紅羽 route battle loss state |
| `82`–`83` | 紅羽 chapter 3 destination/route choices |
| `85` | 蘭-last / 蘭-ending condition marker in 紅羽 route |
| `86` | 紅羽 END condition marker; also used for a 諏慧姫 CG-seen state in 瑞希 route |
| `89` | 諏慧姫 affection |
| `90` | 蘭-route marker in 瑞希 route; partly commented |
| `92`–`94` | 紅羽/朧 chapter 4 branch and companion state |
| `95` | 八尋’s team joined the 阿佐弥 battle |
| `96` | Defeated 八尋’s team in 朧 chapter 3; mirror and 朧-諏慧姫 branch condition |
| `101`–`102` | 京 / 伊勢 visit history in the 阿佐弥/紫芳 routes |
| `111` | Who is accompanying 諏慧姫 (`1`/`2` variants) |
| `116`–`121` | 紅羽/紫芳 meeting, search and scene-seen flags |
| `122` | 瑞希 dialogue/scene correction |
| `123` | 長虫 / long-worm encounter seen |
| `124` | 関 / barrier passed |
| `131` | Met 紅羽 |
| `132` | 阿佐弥 route battle loss branch |
| `134` | 瑞希 chapter 4 battle loss marker |
| `136`–`138` | 阿佐弥 chapter 3 scene progress |
| `141`–`143` | 阿佐弥 chapter 3 battle/ending state |
| `145` | 阿佐弥 destination/choice state |

## Save and load behavior

Archive snapshots are stored in SQLite on the server and cached in browser
`localStorage`. They save:

- `flags`
- `party`
- `mapMode`
- `protagonist`
- current `scene` / `pc`
- stage layers
- dialogue preview metadata

Loading an archive restores the flag map, so later `IFT`/`FCK` checks see the
same state as when the save was made.

A **direct scene link** such as:

```text
?scene=yr1_02&cmd=123
```

is different. It starts from an empty flag map unless an archive is loaded.
`Player.restoreBefore` replays commands earlier in that one script to rebuild
the stage, map mode, party and some flags, but it cannot reconstruct flags set
in previous scenes. A mid-story jump can therefore take a different branch or
skip conditional dialogue.

## Inspecting flags

In the browser:

```js
window.__mitama.flags()
window.__mitama.state().flags
window.__mitama.setFlag(89, 2)
```

The debug panel (`D` or `?debug=1`) shows the non-zero flags. The server mirror
is available at:

```sh
curl localhost:8080/api/debug/state | jq .flags
```

Archives store the same map under `flags` in `localStorage` for
`mitama.archives.v1`.

## Remaining unknowns

- Flags `0`, `1`, `15`, `38`, and several 100-level flags need a full
  scene-by-scene audit.
- `10`–`13` map-register semantics are not fully decoded.
- Several ending checks are commented out or bypassed in the original scripts.
- The current runtime implements the control-flow commands approximately;
  `FCK` AND combinations and numeric `IFT` are reliable, but map encounters and
  some branch conditions still depend on future map work.
