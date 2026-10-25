/**
 * Curated story-interlude mappings. These are deliberately opt-in and kept
 * separate from the generic `e…` gallery scenes: an event only runs when its
 * base scene reaches the exact anchor command.
 *
 * `replaceEnd` is inclusive. After the event's TITLE, the base script resumes
 * at `returnPC`.
 */
export interface EventInterlude {
  event: string;
  baseScene: string;
  anchorPC: number;
  replaceEnd: number;
  returnPC: number;
  note?: string;
}

export const EVENT_INTERLUDES: EventInterlude[] = [
  {
    event: "eyr1_02",
    baseScene: "yr1_02",
    anchorPC: 167,
    replaceEnd: 190,
    returnPC: 191,
    note: "Ran's water scene; base continues with the knife confrontation.",
  },
  {
    event: "eyr4_03",
    baseScene: "yr4_03",
    anchorPC: 249,
    replaceEnd: 379,
    returnPC: 380,
    note: "Asami event; the event's choice replaces the base branch.",
  },
];

export function findEventAt(scene: string, pc: number): EventInterlude | undefined {
  const name = scene.replace(/\.txt$/i, "").toLowerCase();
  return EVENT_INTERLUDES.find(
    (entry) =>
      entry.baseScene.toLowerCase() === name &&
      entry.anchorPC === pc,
  );
}
