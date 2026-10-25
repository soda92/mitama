# In-story adult scene guide (18+)

> **Spoilers and adult content warning.**  
> This guide is for the 18+ DVD release. It describes route and choice
> structure, not explicit scene content. Save before every listed choice.

## First: `e…` scenes are not story scenes

The Gallery → Scenes browser contains the standalone `e…` recollection
scripts. They are not inserted into the normal route.

The in-story adult scenes live in the **base scenes** (`yr…`, `yk…`, `ym…`,
`os…`, `oh…`, `oa…`, `oe…`). The `e…` versions are useful for replaying a
scene after it has been seen, but they are not the trigger.

## General rules

- Most in-story scenes are gated by **route choice**, **in-scene choice**, or
  both.
- Battle results only matter on branches that explicitly contain a battle.
- Affection/counter flags mostly control later branches or endings; they are
  not a universal unlock for every scene.
- Save before every `SLT` choice and before entering a battle.
- Settings → battle policy can be set to `auto-win` or `auto-lose` while
  exploring alternate branches. Return it to `play` for normal play.
- Use Navigator → Page/Chapters or a direct URL only for debugging, because
  jumping to an arbitrary command does not reconstruct all route flags.

## Route gates

| Route | Gate | Result |
| --- | --- | --- |
| 八尋 → 紅羽 | `yr1_11`, choose 「わかった…一緒に行こう」 | `YK1_01` |
| 八尋 → 瑞希 | `yk2_12`: take Mizuki along, then send Kureha to Ise | `YM2_02` |
| 朧 → 紫芳 | `os1_19`, choose 「わかった…結界のこともわからないし…」 | `OH1_01` |
| 朧 → 阿佐弥 | `os2_14`, choose 「わかった…ついてこい」 | `OA2_01` |
| 朧 → 諏慧姫 / 更紗 | `os3_19`, flag `96` split | 諏慧姫 branch or 更紗 chapter 4 |

The `yk2_12` choice is a two-stage gate:

```text
take Mizuki along
  → send Kureha to Ise
      → Mizuki route (YM2_02)

take Mizuki along
  → send Mizuki to Taima
      → Kureha route (YK2_13)

refuse to take Mizuki
  → Kureha route (YK2_13)
```

## 八尋 route

### 蘭

Mostly main-route content; no special branch is required.

| Base scene | How to reach it |
| --- | --- |
| `yr1_02` | Follow the main Yahiro route; the water scene occurs during the mountain search. |
| `yr1_03` | Continue the main route. |
| `yr1_15` | Continue the main route. |
| `yr2_19` | Continue the main route. |
| `yr4_07` | Final 蘭 branch; choose 「ああ…」 rather than 「蘭…やめよう」 for the 蘭 ending flag. |

`yr2_08` is a Mizuki-related scene in the Yahiro route; it is not the 蘭 water
scene.

### 紅羽

1. Play the Yahiro route.
2. At `yr1_11`, choose:

```text
わかった…一緒に行こう
```

This switches to `YK1_01`.

Then the main Kureha scenes include:

| Base scene | Trigger / note |
| --- | --- |
| `yr1_11` | The first Kureha branch scene; the route gate is the final choice. |
| `yk1_06` | Continue the Kureha route. |
| `yk2_03` | At the split, choose 「よし、俺が話を聞いておく」 for the Shihou/red-shrine scene branch. |
| `yk3_13` | Continue the Kureha route. |
| `yk4_06` | At the three-way choice choose 「押し倒す」 for the adult branch. 「刀を抜く」 goes to a battle; 「諭す」 avoids the adult scene. |
| `yk4_07` | Continue after `yk4_06`. |

The `yk4_06` choice is the important one. Save immediately before:

```text
刀を抜く
押し倒す   ← adult branch
諭す
```

Some Kureha-route scenes contain dark or coercive content; the guide is
route-level, not a content endorsement.

### 瑞希

1. At `yk2_12`, choose to take Mizuki along.
2. When Kureha offers to return to Ise, choose:

```text
すまない、紅羽、伊勢まで送るよ
```

This changes party membership and loads `YM2_02`.

Key Mizuki-route scenes:

| Base scene | Note |
| --- | --- |
| `yk2_12` | Route transition; the adult Mizuki scene is the event variant `eyk2_12`, not the base scene. |
| `ym2_12` | Continue the Mizuki route. |
| `ym3_08` | Continue the Mizuki route. |
| `ym4_06` | Continue the Mizuki route. |
| `ym9_99` | Gallery/event variant; no exact base scene. |

If you send Mizuki to Taima instead, you remain on the Kureha route.

### 紫芳

`yk2_03` contains the Shihou shrine/scar scene. At its split choose:

```text
よし、俺が話を聞いておく
```

The scene sets `FLG 57` and proceeds through the `ラベルA` branch. The
corresponding gallery replay is `eyk2_03`, but the story itself is `yk2_03`.

### 阿佐弥

`yr4_03` contains an Asami scene in the Yahiro route. It has an early choice
and a battle elsewhere in the scene. Save before the choice and before the
battle; the adult sequence is on a specific branch, not the battle-win result.
The gallery replay is `eyr4_03`.

### Other Yahiro scenes

These contain adult content but are not tied to a single heroine route:

```text
yr2_09       one of the mountain/forest scenes
yr2_18       cell-search branch with counter 117
yr2_21       continue main route
yr3_10       dark branch; choose help + do not fight for the explicit branch
yr4_06       late-route scene; choices and battle branches exist
```

`yr3_10` is the clearest example of a choice-gated adult branch:

```text
41: 蘭の様子を見に行く
89: 助ける
103: いや…だけど…やめろよ
```

The battle at 111 is an alternate branch; the adult branch is reached by
avoiding that fight. This branch is dark/non-consensual; it is listed for
completeness, not recommended.

## 朧 route

### 紫芳

At `os1_19`, choose:

```text
わかった…結界のこともわからないし…
```

This loads `OH1_01`.

Key scenes:

```text
oh3_12       Kureha-related shrine scene
oh4_09       Shihou scene
```

`oh3_12` is mostly linear. `oh4_09` has choices before the event; save before
the scene.

### 阿佐弥

At `os2_14`, choose:

```text
わかった…ついてこい
```

This loads `OA2_01`.

Key scenes:

```text
oa4_07
oa4_08
os2_14
os3_15
```

The `oa4_*` scenes are mostly linear after entering the Asami route. `os2_14`
is the route gate; `os3_15` is later in the same branch family.

### 更紗 / 諏慧姫

The Oboro route has a `os3_19` split controlled by flag `96`:

```text
96 != 0  → 諏慧姫 branch
96 == 0  → 更紗 chapter 4 branch
```

Key scenes:

| Base scene | Trigger |
| --- | --- |
| `os1_05` | Choices at the mansion; one branch leads into the Sarasa/Suikihime material. |
| `os1_11` | Continue the relevant branch. |
| `os2_01` | Continue the Oboro route. |
| `os2_12` | Continue the Oboro route. |
| `os2_22` | Continue the Oboro route. |
| `oh4_06` | Choose 「泉の方に行く」 at the first split; then choose 「……双葉…」 or 「……更紗…」 at the second split for different branches. |
| `oh4_99` | Gallery/event variant; no exact base scene. |
| `oe4_10` | Suikihime branch/ending material. |

`oh4_06` is the most useful scene to save before: the first choice decides
whether you find the spring scene, and the second choice changes the branch.

## Replaying scenes

- **Gallery → Scenes** replays the `e…` recollection versions.
- **Story** button on a gallery event opens its related base scene from the
  beginning, but does not reconstruct the exact route flags.
- For a scene that is already in the story, use the base scene ID with
  Navigator or a debug URL:

```text
?scene=yk4_06&cmd=208&pack=dvd
?scene=oh4_06&cmd=99&pack=dvd
?scene=yr3_10&cmd=41&pack=dvd
```

Jumping directly to a scene may not set the flags that normally lead there.
Prefer save files and normal choices when testing triggers.

## Quick recipes

### Kureha route

```text
Yahiro route
→ yr1_11: わかった…一緒に行こう
→ yk2_03: よし、俺が話を聞いておく
→ yk2_12: take Mizuki → send Mizuki to Taima (stay Kureha)
→ yk4_06: 押し倒す
```

### Mizuki route

```text
Yahiro route
→ yk2_12: わかった、瑞希、一緒に行こう
→ yk2_12: すまない、紅羽、伊勢まで送るよ
→ YM2_02 onward
```

### Shihou route

```text
Oboro route
→ os1_19: わかった…結界のこともわからないし…
→ OH1_01 onward
→ oh4_09 for the later Shihou scene
```

### Asami route

```text
Oboro route
→ os2_14: わかった…ついてこい
→ OA2_01 onward
→ oa4_07 / oa4_08
```

### Sarasa / Suikihime

```text
Oboro route
→ os3_19 branch / flag 96
→ oh4_06 (spring branch)
→ oe4_10 for the Suikihime ending material
```

## Important limitations

This guide documents **route-level triggers**, not every branch permutation.
Some scenes have:

- battle-result branches;
- counters such as flags `33` and `117`;
- route-local flags reused by different routes;
- dark/non-consensual content.

The exact affection thresholds for every optional scene are not fully decoded.
The reliable approach is to save before the listed choices, keep separate
archives for route branches, and use `auto-win`/`auto-lose` only when
exploring battle alternatives.
