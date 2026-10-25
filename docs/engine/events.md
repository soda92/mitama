# Story event interludes

`e…` scripts are standalone CG/event scenes. The **event scenes** setting can
play a curated subset of them as temporary interludes inside the base story.

## Why not replace every scene name

A blanket `xxx → exxx` replacement is unsafe:

- five `e…` scenes have no base scene;
- every `e…` scene ends with `TITLE`;
- no `e…` scene contains a `LOD`;
- many are trimmed or alternate versions of only part of a base scene.

Replacing a whole base scene would skip choices, flags, party changes and the
rest of the route.

## Runtime model

The base scene stays authoritative. At an anchor command the Player pushes an
event scene as a temporary frame:

```text
base frame (yr1_02, pc 167)
  → push event frame (eyr1_02, pc 0)
  → run event
  → TITLE or scene end means "return from event"
  → pop event frame
  → restore base stage/BGM/flags/party
  → continue base at returnPC
```

Event commands use the normal dialogue, choice, voice and BGM machinery.
Saving is disabled while an event is active.

## Mapping schema

Mappings live in `web-app/src/game/events.ts`:

```ts
interface EventInterlude {
  event: string;
  baseScene: string;
  anchorPC: number;
  replaceEnd: number;
  returnPC: number;
  note?: string;
}
```

- `anchorPC` is the exact command index in the base scene that starts the
  replacement.
- `replaceEnd` is inclusive and documents the base segment being replaced.
- `returnPC` is where the base scene resumes after the event's `TITLE`.

Only enable a mapping after checking its anchor and return point. The initial
implementation deliberately enables two vertical-slice mappings:

```text
eyr1_02 -> yr1_02, anchor 167, return 191
eyr4_03 -> yr4_03, anchor 249, return 380
```

`eyr1_02` tests a simple no-choice event. `eyr4_03` tests a choice inside the
event. `eyr3_10` remains gallery-only for now because `yr3_10` already contains
a complex explicit branch with choices, party changes and LODs.

## Remaining work

The matching pass produced candidate mappings for the other event scenes, but
anchors need validation. Keep unvalidated scenes out of the interlude map. In
particular:

- `eyk2_12` has no matching voice/text anchor in `yk2_12`;
- `eyr3_10` is a composite branch;
- `eoe4_10` has no following LOD;
- `eoa4_a08`, `eoh4_99`, `eym9_99`, `eyr3_08_1` and `eyr4_99` have no exact
  base counterpart.
