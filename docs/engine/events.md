# Event recollection scenes

The `e…` scenarios are standalone CG/event recollection scripts. They are not
additional story branches.

## Why they are gallery-only

- They end with `TITLE`.
- They contain no `LOD` or `JMP`.
- Most reuse CGs and scenes already present in the normal story.
- Some are trimmed/composite replays of a story branch (for example
  `eyr3_10` and the explicit branch in `yr3_10`).
- Five have no exact base scene.

The executable also contains a CG/event table pairing `CG*.bmp` images with
`e…` scripts. This is consistent with a recollection/event viewer, not a
story dispatcher trigger.

## Web player

Gallery → **Scenes** is the recollection browser:

- cover thumbnail from the first CG in the event script
- heroine label
- 八尋編 / 朧編 grouping
- `EVENT` badge
- `Story` link to the related base scene when one exists

The `Story` link opens the base scene from the beginning. It is a context link,
not an attempt to insert the event into the route.

There is no story-interlude setting. The normal route remains unchanged; event
scenes are started only from the gallery or a direct scene URL.
