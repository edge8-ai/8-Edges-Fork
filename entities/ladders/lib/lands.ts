// What each act would land for the reader (QS.15; quests spec "Lands for
// you"; ADR 0021 "Who reads what"). Pure: it reads the reader's own Learn &
// Share standing and the badges they found, both already the reader's from
// myStanding, so the rail beside Campfires, the Lore and Lighthouses adds no
// third read to the door. For each act:
//
// - its points, and where it takes the reader, placed with the tier they hold
//   (reachOn), and whether it is a new tier; where they stand before it is
//   the standing itself, which the page already holds;
// - when it is not a new tier, the points left after it to the next division,
//   as "how far is left" (never "only n more", never "behind");
// - the next one or two badges it can find (act-badges.ts), each with its
//   rarity word and the reader's own count where the standing holds exactly
//   that count; a family offers its next unfound tier only, as the locked tile
//   does; a secret badge is never named, whatever the list says;
// - the Title it lets them wear: the title of the badge this one act finds
//   now (a one-off still unfound, or a family tier one act away by the
//   reader's exact count), else a title they already hold from the same list,
//   said as held, else none. A family title the act does not reach yet is
//   not promised: one Beacon finds Lighthouse, not Keeper of the light.
//
// The catalogue is a parameter so a test can stub it out: with no badges the
// answer carries the points and the tier and names no badge and no Title.
import type { Lands, LandsBadge, LearnShareAct, LearnSharePlace } from "../slots";
import { ACT_BADGES, type ActBadge, type ActBadges } from "./act-badges";
import { BADGES, type Badge } from "./badges";
import { ACT_POINTS, nextPlace, reachOn } from "./learn-share-place";
import type { LearnShareCounts, LearnShareTier } from "./points";
import type { LadderStanding } from "./standing";

/** The most badges the rail names for one act. */
export const MOST_BADGES = 2;

/** What one act lands, without its helm (the emblem module draws that), and with the tier it reaches, which the helm needs. */
export type LandsAnswer = Omit<Lands, "helm"> & { tier: LearnShareTier };

export type Catalogue = { badges: readonly Badge[]; acts: Readonly<Record<LearnShareAct, ActBadges>> };

const LIVE: Catalogue = { badges: BADGES, acts: ACT_BADGES };
const ACTS = Object.keys(ACT_POINTS) as LearnShareAct[];

/** The next badge an entry names, with the badge itself: a one-off the catalogue holds unfound and not secret, or a family's next unfound tier. */
function nextBadge(entry: ActBadge, badges: readonly Badge[], found: ReadonlySet<string>, counts: LearnShareCounts): { badge: Badge; shown: LandsBadge } | null {
  if ("oneOff" in entry) {
    const b = badges.find((x) => x.id === entry.oneOff);
    if (!b || b.secret || found.has(b.id)) return null;
    return { badge: b, shown: { name: b.name, rarity: b.rarity, progress: { have: 0, at: 1 } } };
  }
  const next = badges
    .filter((x) => x.family === entry.family && !x.secret && !found.has(x.id))
    .sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0))[0];
  if (!next) return null;
  const progress = entry.count !== null && next.count ? { have: counts[entry.count], at: next.count.at } : null;
  return { badge: next, shown: { name: next.name, rarity: next.rarity, progress } };
}

/** Whether this one act finds the badge: a one-off outright, or a family tier one act away by the reader's exact count. */
const foundByThisAct = (b: LandsBadge): boolean => b.progress !== null && b.progress.at - b.progress.have <= 1;

/**
 * The Title an act lets the reader wear: the title of the first badge in the
 * act's list that this act finds now; failing that, a title the reader
 * already holds from a badge in the list, said as held; failing that, none.
 */
function titleOf(entries: readonly ActBadge[], next: readonly { badge: Badge; shown: LandsBadge }[], badges: readonly Badge[], found: ReadonlySet<string>): LandsAnswer["title"] {
  const holds = (title: string) => badges.some((b) => b.title === title && !b.secret && found.has(b.id));
  const now = next.find((n) => foundByThisAct(n.shown));
  if (now) return { name: now.badge.title, held: holds(now.badge.title) };
  // A held family's title first (the one that grows with the act), then a held one-off's.
  const heldFirst = [...entries].sort((a, b) => Number("oneOff" in a) - Number("oneOff" in b));
  for (const entry of heldFirst) {
    const held = badges.find((b) => !b.secret && found.has(b.id) && ("oneOff" in entry ? b.id === entry.oneOff : b.family === entry.family));
    if (held) return { name: held.title, held: true };
  }
  return null;
}

/** The whole points left from `reached` to the next division's start, and that division; null at the open top. */
function leftAfter(next: (LearnSharePlace & { start: number }) | null, reached: number): LandsAnswer["left"] {
  if (!next) return null;
  const { start, ...to } = next;
  return { points: Math.ceil(start - reached), to };
}

/** What each act would land for the reader, from their own Learn & Share standing and the badges they found. */
export function landsFor(s: LadderStanding, found: readonly { key: string }[], catalogue: Catalogue = LIVE): Record<LearnShareAct, LandsAnswer> {
  if (s.ladder !== "learn_share") throw new Error("landsFor reads the Learn & Share ladder only");
  const counts = s.counts as LearnShareCounts;
  const mine = new Set(found.map((f) => f.key));
  const answer = (act: LearnShareAct): LandsAnswer => {
    const points = ACT_POINTS[act];
    const { tier, division, place: after, newTier } = reachOn(s, points);
    const left = newTier ? null : leftAfter(nextPlace(tier, division), s.points + points);
    const entries = catalogue.acts[act].badges;
    const next = entries.map((e) => nextBadge(e, catalogue.badges, mine, counts)).filter((n): n is NonNullable<typeof n> => n !== null);
    const badges = next.slice(0, MOST_BADGES).map((n) => n.shown);
    return { points, after, newTier, left, badges, title: titleOf(entries, next, catalogue.badges, mine), tier };
  };
  return Object.fromEntries(ACTS.map((act) => [act, answer(act)])) as Record<LearnShareAct, LandsAnswer>;
}
