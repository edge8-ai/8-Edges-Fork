// The reader's Learn & Share position as Quests' next move draws it (QS.13;
// quests spec "Your next move"; ADR 0021). Pure: it reads one LadderStanding,
// already the reader's own from myStanding, and works out what the page shows
// beside the acts, so Quests never holds the points table or the tier starts.
//
// - Where the reader's division starts and where the next one starts: the bar
//   runs between them ("400 of 450"), as the approved prototype draws it.
// - What each act earns, from LEARN_SHARE_POINTS.
// - Where each act would take the reader, and whether it crosses into a new
//   tier ("→ Gold II", "new tier"). QS.15's Lands for you rail reads the same
//   answer, so before and after are worked out here once.
//
// The held tier is never lowered, so a place after an act is placed with the
// tier held, exactly as the recompute places it.
import type { LearnShareAct, LearnShareDivision, LearnSharePlace, LearnShareStanding } from "@/kernel/shell/page-slots";
import { placeWords } from "./place-words";
import { LEARN_SHARE_POINTS, LEARN_SHARE_STARTS, nextTier, placeOn, shownPoints, tierName, type LearnShareTier } from "./points";
import type { LadderStanding } from "./standing";

/** What each act on the page earns, in the page's own names for them. */
export const ACT_POINTS: Record<LearnShareAct, number> = {
  hit: LEARN_SHARE_POINTS.hit,
  learning: LEARN_SHARE_POINTS.spark,
  fire: LEARN_SHARE_POINTS.fire,
  beacon: LEARN_SHARE_POINTS.beacon,
};

const ACTS = Object.keys(ACT_POINTS) as LearnShareAct[];

/** A place with its words in both styles, from the one module that words a place (lib/place-words.ts). */
export function placed(tierName: string, division: LearnShareDivision): LearnSharePlace {
  const p = { tierName, division, stars: null, immortalBand: null };
  return { tierName, division, words: { game: placeWords(p, true), plain: placeWords(p, false) } };
}

/** Where a division of a tier starts: IV at the tier's start, each next a quarter of the way to the next tier. */
export function divisionStart(tier: LearnShareTier, division: 1 | 2 | 3 | 4): number {
  const next = nextTier("learn_share", tier) as LearnShareTier | null;
  const start = LEARN_SHARE_STARTS[tier];
  if (next === null) return start;
  return start + ((4 - division) * (LEARN_SHARE_STARTS[next] - start)) / 4;
}

/** The place after this one: the next division up, or the next tier's IV; null at the open top. */
export function nextPlace(tier: LearnShareTier, division: LearnShareDivision): (LearnSharePlace & { start: number }) | null {
  if (division === null) return null;
  if (division > 1) {
    const up = (division - 1) as 1 | 2 | 3;
    return { ...placed(tierName(tier), up), start: divisionStart(tier, up) };
  }
  const next = nextTier("learn_share", tier) as LearnShareTier | null;
  if (next === null) return null;
  return { ...placed(tierName(next), nextTier("learn_share", next) === null ? null : 4), start: LEARN_SHARE_STARTS[next] };
}

/** Where `points` more would take the reader, placed with the tier they hold: the tier and division reached, the place as words, and whether it is a new tier. */
export function reachOn(s: Pick<LadderStanding, "points" | "tier">, points: number): { tier: LearnShareTier; division: LearnShareDivision; place: LearnSharePlace; newTier: boolean } {
  const after = placeOn("learn_share", s.points + points, s.tier);
  const tier = after.tier as LearnShareTier;
  return { tier, division: after.division, place: placed(tierName(tier), after.division), newTier: after.tier !== s.tier };
}

/** Where `points` more would take the reader, as the next move's `reaches` carries it. */
export function reachAfter(s: Pick<LadderStanding, "points" | "tier">, points: number): LearnSharePlace & { newTier: boolean } {
  const { place, newTier } = reachOn(s, points);
  return { ...place, newTier };
}

/** The next move's view of the reader's Learn & Share standing, without the helm (the emblem module draws that) or what each act lands (lib/lands.ts). */
export function learnSharePlace(s: LadderStanding): Omit<LearnShareStanding, "helm" | "lands"> {
  if (s.ladder !== "learn_share") throw new Error("learnSharePlace reads the Learn & Share ladder only");
  const tier = s.tier as LearnShareTier;
  const next = nextPlace(tier, s.division);
  const reaches = Object.fromEntries(ACTS.map((act) => [act, reachAfter(s, ACT_POINTS[act])])) as LearnShareStanding["reaches"];
  return {
    ...placed(s.tierName, s.division),
    points: shownPoints(s.points),
    divisionStart: s.division === null ? s.start : divisionStart(tier, s.division),
    next,
    pointsFor: { ...ACT_POINTS },
    reaches,
  };
}
