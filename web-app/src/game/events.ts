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

/**
 * Event scenes that need manual anchor review before they can become story
 * interludes. Keep them out of EVENT_INTERLUDES until their base range is
 * checked against the actual branch.
 */
export const MANUAL_EVENTS = new Set([
  "eoe4_10",
  "eoh4_06",
  "eos3_15",
  "eyk2_12",
  "eyk4_07",
  "eym2_12",
  "eyr1_11",
  "eyr3_10",
  "eyr4_06",
  "eyr4_07",
]);

/** Event scenes with no exact base scene in this DVD build. */
export const GALLERY_ONLY_EVENTS = new Set([
  "eoa4_a08",
  "eoh4_99",
  "eym9_99",
  "eyr3_08_1",
  "eyr4_99",
]);

export type EventStatus = "interlude" | "manual" | "gallery" | "candidate";

export function eventStatus(scene: string): EventStatus {
  const name = scene.replace(/\.txt$/i, "").toLowerCase();
  if (EVENT_INTERLUDES.some((entry) => entry.event === name)) return "interlude";
  if (MANUAL_EVENTS.has(name)) return "manual";
  if (GALLERY_ONLY_EVENTS.has(name)) return "gallery";
  return "candidate";
}
