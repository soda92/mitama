# Battle data and runtime

The battle definitions are Shift-JIS text, not binary. Comments after `//`
explain most fields. The web engine parses them in `pkg/battle` and serves the
normalized structures through `/api/battle` and `/api/battle/character`.

## `.pty` — party

A `.pty` file describes one side of an encounter. Example
(`data/dvd/battle/yr1_01_01.pty`):

```text
"八尋蘭第一章　１「七巳」"          // party name
"guibn007.bmp"                       // HP gauge image
"S024.xa"                            // battle BGM
416                                  // maximum party HP
"taizi_in.o"                         // entrance motion
"taizi_out.o"                        // exit motion
"yr1_01_01_nanami.chr"               // leader
"yr1_01_01_goki.chr",0               // striker 1
"Empty",2                            // striker 2
"Empty",4                            // striker 3
:win
  "勝ち！！"
  "S018A3.XA"
:lose
  "負け～"
  "S018A3.XA"
:end
```

Field meaning:

| Field | Meaning |
| --- | --- |
| name | Display name for the party/gauge |
| gauge | BMP used for the HP gauge |
| BGM | Battle music (`.xa`) |
| max HP | Shared party HP |
| enter/exit | Encounter motion names |
| members | `.chr` file plus striker action number |
| `:win` / `:lose` | Result text and optional jingle |

`Empty` means an unused member slot. The engine currently loads the leader and
all non-empty strikers.

## `.chr` — character

Example (`data/dvd/battle/yahiro.chr`):

```text
"八尋"                       // name
1,1,1                        // proficiency: sword, technique, receive
0                            // initial/default action
0,0,0                        // resistances
20                           // striker survival chance
"cc_yahiro.o"                // battle object
:speical                     // (typo in the original data)
  25                         // trigger chance
  0,0                        // trigger conditions
  0                          // attack type
  1                          // damage multiplier
  0                          // next-turn enemy stun
  0                          // take damage on success
  0                          // self-stun on success
  20                         // motion number
:special
  ...
:spname
  0
  "二段斬り"
  0
  3
:end
```

The web engine currently consumes:

- name
- the three proficiency values
- default action
- resistances and survival chance
- object file
- `:actionrate` rows (weight and power range used by combat resolution)

Special-move blocks and motion numbers are parsed only as opaque sections for
now.

## `.o`, `.spt`, `.mtn` — battle sprites

Each `.chr` points to an object file such as `cc_yahiro.o`:

```text
:sprite
  "yahiro00.spt"
  ...
:motion
  "def_jmpin.mtn"
  "def_kamae.mtn"
  ...
```

The idle pose uses motion slot 1, e.g. `def_kamae.mtn`:

```text
spno 3
spidx 0
wait 16
spidx 1
wait 16
```

That resolves to sprite slot 3 (`yahiro03.spt`) and its frame list. `.spt`
files are text rectangles:

```text
2
0,0,112,128,56,128
112,0,112,128,56,128
```

The server resolves this chain and returns `sprite` and `motions` on
`/api/battle` and `/api/battle/character`: BMP URLs, frame rectangles, idle
frame indices, and resolved frame/wait sequences for every motion slot. The
battle screen chroma-keys black to transparency and plays:

- motion 1 as the idle loop
- motion 7 for sword attacks
- motion 8 for techniques
- motion 9 for guarding
- motion 13 for damage
- motion 15 for defeat

Motion events at the current frame are replayed as well: `se`, `c_se` and
`se_attack` trigger sound effects, `flash` overlays a short white/red/black
flash, and `effectem` loads an `ef_*.o` effect animation and draws its frames
additively. `movjmpbase` / `movjmpland` / `movjmp` offsets are applied as a
short sprite translation; `waitmov` and `attackend` are parsed and motion
duration is used to pace the next action. Precise landing/effect timing remains
approximate.

## Runtime approximation

The browser battle screen is deliberately simple until the real damage,
action-rate and motion systems are recovered:

- Party HP is shared.
- Player party HP is `208 + 96 × (number of PARTY IN members)`.
- Enemy HP is the `.pty` maximum.
- Actions are **剣**, **術**, **受**.
- Sword/technique damage uses the active character's skill values plus a
  random roll.
- Defending reduces the next enemy hit.
- Enemy strikers act as one shared attacker for now.
- Victory/defeat writes flag `20` (`1`/`0`), matching the scripts'
  `IFT 20 = …` branches.

The screen also supports debug auto-resolve modes (win, lose, random) from
Settings.

## Server API

```text
GET /api/battle?pack=dvd&name=yr1_01_01
GET /api/battle/character?pack=dvd&name=yahiro
GET /api/battle/effect?pack=dvd&name=bakuhatu
```

The first returns `{party, characters}`. The second returns one `.chr`.
Lookups are case-insensitive and load `.chr` files referenced by the `.pty`.

## Known gaps

- Actual damage formula, turn order and action-rate weighting.
- Special techniques and `:spname` learn conditions.
- `.o` / `.spt` / `.mtn` battle sprites and animations.
- Exact attack/hit/damage formula; action-rate power is currently the average
  of the row's min/max values.
- Player party level/HP persistence in archive snapshots.
