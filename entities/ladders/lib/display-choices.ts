// What a person may choose for their profile (LD.6; spec "The profile page";
// ADR 0021), in one place for the command that saves a choice, the reads that
// answer it and the page that offers it. Everything starts hidden: the banner
// is the meadow, there is no Title, no stat is switched on and the display case
// is empty until its owner fills it.
import type { Banner } from "./rows";

/** The banners in the picker's order: the four Quests-world scenes, then the person's own photo. */
export const BANNERS = ["meadow", "dragon", "hydra", "lighthouse", "photo"] as const satisfies readonly Banner[];

/** The stats a person may switch on; each value comes from their act counts. */
export const STAT_KEYS = ["hits", "sparks", "fires", "beacons", "cards", "humanTokens"] as const;
export type StatKey = (typeof STAT_KEYS)[number];

/** The display case holds five badges (the table's check holds the same five); the first three are the postcard's stickers. */
export const DISPLAY_CASE_HOLDS = 5;

/** What setDisplay is given: only the fields to change, so one control never undoes another. */
export type DisplayChange = {
  banner?: Banner;
  /** A found badge's id worn as a Title, or null for No title. */
  titleBadge?: string | null;
  shownStats?: StatKey[];
  /** Found badges' ids, in order, at most five. */
  displayCase?: string[];
};
