// What each act on the Quests page can find in the badge catalogue (QS.15;
// quests spec "Lands for you"; the catalogue,
// docs/engineering/2026-10-21-ladders-badges.md). Data beside the catalogue,
// so Quests never names a badge: the Lands for you rail reads it through the
// learnShareStanding page slot, and lib/lands.ts works the answer out.
//
// Each act lists, in the order the rail offers them, the badges the act
// itself moves: a one-off the act finds outright (by its id), or a family (by
// its name in the catalogue), whose next unfound tier the rail names. A family
// names the count in the reader's standing that is exactly its own (Hunter
// counts hits, Fire keeper fires, Keeper of the light Beacons); where the
// standing holds no such count the family's is null and the rail shows the
// badge with no number rather than a wrong one. Lorewright counts learning
// sparks, and the standing counts every spark; Scribe counts hits on a
// learning Bounty only, and the standing counts every hit.
//
// The list is checked against the rules themselves (act-badges.test.ts): each
// one-off is found by one act of its kind, each family's count moves by one
// with each act, and a family left without a count is one whose count some
// other act of the same kind does not move. A
// badge whose rule needs more than the act is not listed (Footnotes needs a
// source on the learning, Cold fire, warm hands a fire someone else asked
// for), because the act alone would not find it. The Title an act lets the
// reader wear is not listed here: lib/lands.ts reads it off these same
// entries, as the title of the badge the act finds now, or one already held.
import type { LearnShareAct } from "../slots";
import type { LearnShareCounts } from "./points";

/** A badge an act moves: a one-off it finds outright, by id; or a family, by name, with its exact count in the standing or null. */
export type ActBadge = { oneOff: string } | { family: string; count: keyof LearnShareCounts | null };

export type ActBadges = { badges: readonly ActBadge[] };

export const ACT_BADGES: Readonly<Record<LearnShareAct, ActBadges>> = {
  hit: { badges: [{ oneOff: "first-hit" }, { family: "Hunter", count: "hits" }, { family: "Scribe", count: null }] },
  learning: { badges: [{ oneOff: "spark-struck" }, { oneOff: "first-page" }, { family: "Lorewright", count: null }] },
  fire: { badges: [{ family: "Fire keeper", count: "fires" }] },
  beacon: { badges: [{ oneOff: "lighthouse" }, { family: "Keeper of the light", count: "beacons" }] },
};
