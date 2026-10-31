// The Achievements tab as a page draws it (LD.7b; spec "The profile page";
// the badges doc, sections 4 to 6; ADR 0021): the owner's badge case, grouped
// Learn & Share, Builder and Both ladders. Pure, so the owner-only rules are
// tested on values:
//
// - a found badge is a tile with its flavour, its rarity word, a band only
//   once three people hold it, and whether it sits in the display case; one
//   found by the replay or an act and not yet seen is marked new and offers
//   the drop's two answers;
// - a family shows one locked tile, its next tier, with its rule and, when
//   the owner's act facts were read, "You have n. This one is found at m.";
//   every unfound one-off shows its rule;
// - an unfound secret badge is "???" and its hint, never its rule.
//
// It is built only from the reader's own standing and act facts, and the
// company's per-badge totals; nothing in it names anyone else.
import type { PersonActFacts } from "../../lib/act-facts";
import { BADGES, type Badge, type BadgeLadder, type Rarity } from "../../lib/badges";
import type { BadgeFound } from "../../lib/standing";
import type { BadgeHolders } from "../../lib/store";
import { glyphOf, type Glyph } from "./glyphs";

export type FoundTile = {
  state: "found";
  id: string;
  unlockId: string;
  name: string;
  rarity: Rarity;
  glyph: Glyph;
  flavour: string;
  /** "Held by many", "by some" or "by a few"; null below three holders, or when the totals could not be read. */
  band: string | null;
  /** Found and not yet seen: the tile offers the drop's two answers instead of the switch. */
  waiting: boolean;
};

export type LockedTile = {
  state: "locked";
  id: string;
  name: string;
  rarity: Rarity;
  glyph: Glyph;
  /** The "Found by:" line, the catalogue's unlock rule in plain words. */
  rule: string;
  /** A family tier's own count; null for a one-off, at zero, or when the act facts could not be read. */
  count: { have: number; at: number } | null;
};

/** An unfound secret badge: "???" and its hint. It carries no rarity, which would say something about the secret. */
export type SecretTile = { state: "secret"; id: string; hint: string };

export type CaseTile = FoundTile | LockedTile | SecretTile;

export type CaseGroup = { key: BadgeLadder | "first_week"; label: string; tiles: CaseTile[] };

export type BadgeCase = { groups: CaseGroup[]; displayCase: string[] };

const GROUPS: { key: BadgeLadder; label: string }[] = [
  { key: "learn_share", label: "Learn & Share" },
  { key: "builder", label: "Builder" },
  { key: "both", label: "Both ladders" },
];

/**
 * The first-week set (the badges doc, section 7): the easiest doors, shown
 * together at the top of a new person's tab. "First week" is a label, not a
 * window. The group stands while any of them is still to find; once all ten
 * are found they sit in their ladders like every other badge.
 */
export const FIRST_WEEK = ["first-hit", "spark-struck", "first-page", "seat-by-the-fire", "ill-try-that", "summoners-circle", "free-sword", "first-strike", "weighed", "under-the-banner"] as const;
const FIRST_WEEK_GROUP = { key: "first_week", label: "First week" } as const;

/** The fewest holders a band is shown for (ruling 2): below it, one holder is a person. */
export const BAND_FLOOR = 3;

/**
 * A badge's share of the company as a band, never a percentage, and nothing
 * below three holders. Half or more is many, a fifth or more is some, and
 * fewer is a few.
 */
export function bandOf(holders: number, people: number): string | null {
  if (holders < BAND_FLOOR) return null;
  const share = people > 0 ? holders / people : 1;
  if (share >= 0.5) return "Held by many";
  if (share >= 0.2) return "Held by some";
  return "Held by a few";
}

const foundTile = (badge: Badge, unlock: BadgeFound, totals: BadgeHolders | null): FoundTile => ({
  state: "found",
  id: badge.id,
  unlockId: unlock.id,
  name: badge.name,
  rarity: badge.rarity,
  glyph: glyphOf(badge),
  flavour: badge.flavour,
  band: totals ? bandOf(totals.holders.get(badge.id) ?? 0, totals.people) : null,
  waiting: !unlock.shown,
});

// The owner's own count on a family tier. Nothing at zero: "You have 0" says nothing
// the rule does not, and a door is not a tally of what is not there yet.
function countOf(badge: Badge, facts: PersonActFacts | null): { have: number; at: number } | null {
  if (!badge.count || !facts) return null;
  const have = badge.count.of(facts);
  return have > 0 ? { have, at: badge.count.at } : null;
}

const lockedTile = (badge: Badge, facts: PersonActFacts | null): LockedTile => ({
  state: "locked",
  id: badge.id,
  name: badge.name,
  rarity: badge.rarity,
  glyph: glyphOf(badge),
  rule: badge.unlock,
  count: countOf(badge, facts),
});

/**
 * The owner's badge case. `facts` are the owner's own act facts, for the
 * locked tiles' counts; `totals` the company's per-badge holders, for the
 * bands. Either may be null when it could not be read, and the case still
 * draws, with no count and no band.
 */
export function badgeCase(found: readonly BadgeFound[], displayCase: readonly string[], facts: PersonActFacts | null, totals: BadgeHolders | null): BadgeCase {
  const held = new Map(found.map((f) => [f.key, f]));
  // A family's next tier: the lowest tier of it not found, one per family.
  const nextOf = new Map<string, string>();
  for (const badge of BADGES) {
    if (!badge.family || badge.secret || held.has(badge.id) || nextOf.has(badge.family)) continue;
    nextOf.set(badge.family, badge.id);
  }
  const tiles = new Map<BadgeLadder, { found: CaseTile[]; locked: CaseTile[]; secret: CaseTile[] }>(GROUPS.map((g) => [g.key, { found: [], locked: [], secret: [] }]));
  // The first-week set stands together while any of it is still to find.
  const firstWeek: CaseTile[] = [];
  const firstWeekOpen = FIRST_WEEK.some((id) => !held.has(id));
  for (const badge of BADGES) {
    const into = tiles.get(badge.ladder);
    if (!into) continue;
    const unlock = held.get(badge.id);
    if (firstWeekOpen && (FIRST_WEEK as readonly string[]).includes(badge.id)) {
      firstWeek.push(unlock ? foundTile(badge, unlock, totals) : lockedTile(badge, facts));
      continue;
    }
    if (unlock) into.found.push(foundTile(badge, unlock, totals));
    // The catalogue writes a hint as the tile reads it whole ("??? Some fights
    // are one on one."); the tile's name is the "???", so the line is the rest.
    else if (badge.secret) into.secret.push({ state: "secret", id: badge.id, hint: (badge.hint ?? "").replace(/^\?\?\?\s*/, "") });
    else if (!badge.family || nextOf.get(badge.family) === badge.id) into.locked.push(lockedTile(badge, facts));
  }
  const groups: CaseGroup[] = GROUPS.map((g) => {
    const t = tiles.get(g.key)!;
    return { ...g, tiles: [...t.found, ...t.locked, ...t.secret] };
  });
  return {
    groups: firstWeek.length > 0 ? [{ ...FIRST_WEEK_GROUP, tiles: firstWeek }, ...groups] : groups,
    // Only found badges can sit in the case; the list is in the owner's order.
    displayCase: displayCase.filter((id) => held.has(id)),
  };
}
