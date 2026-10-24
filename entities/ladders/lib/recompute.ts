// How positions are written: recompute, never add (LD.1; spec "How positions
// are written"; ADR 0021). Every write is a recompute of one person from their
// acts: both position rows are upserted whole, and a `tier` unlock is inserted
// for every tier the points reach that the person had not reached before.
// Nothing increments a stored number, so an event delivered twice, or out of
// order, writes the same rows; and because an unlock is never taken away, a
// source correction that lowers the points lowers the stored position and
// never the tier the person holds (their highest tier unlock).
//
// `source` says which recompute this is. An event subscriber (LD.2) and the
// nightly replay leave a new unlock unshown, so the person gets their rank-up
// on their next visit; the launch backfill marks everything it credits as
// shown, so history is credited quietly and nobody's first visit is a wall of
// rank-ups.
//
// Badges (LD.7). After the points, the recompute gathers the person's act
// facts and evaluates the catalogue (badges.ts); a badge the facts find that
// the person does not hold yet is a `badge` unlock with its witness row. A
// badge is never lost and never found twice: the unique key and the check
// against the unlocks already held make a replay that finds it again a no-op.
// History is credited quietly. The first replay that finds badges at all (no
// badge unlock exists anywhere yet) is the badges' launch, and marks every
// badge it credits as shown, so nobody's first visit is a drop of everything
// they ever did; until that launch has run, an event recompute writes no
// badge, so an act landing before it cannot jump the queue and leave the rest
// of a person's history to be announced. From the launch on, a badge an event
// or the replay finds waits to be shown, like a rank-up.
import { gatherActFacts, type LadderFacts } from "./act-facts";
import { gatherActs, liveDoors, type Doors } from "./acts";
import { findBadges } from "./badges";
import {
  builderCounts,
  builderPoints,
  higherTier,
  learnShareCounts,
  learnSharePoints,
  placeOn,
  tierIndex,
  tiersReached,
  type BuilderCounts,
  type Ladder,
  type LearnShareCounts,
  type PersonActs,
  type Place,
  type Tier,
} from "./points";
import type { PositionInsert, PositionRow, UnlockInsert, UnlockLadder, UnlockRow, UnlockSource } from "./rows";
import { liveStore, type Store } from "./store";

export type Source = UnlockSource;

export type Deps = { doors: Doors; store: Store; now: () => Date };

/** The live dependencies, built when asked for so no door is read at module scope. */
export function liveDeps(): Deps {
  return { doors: liveDoors(), store: liveStore, now: () => new Date() };
}

/** A person's place on one ladder: where the points sit, and the tier they hold. */
export type LadderPlace = Place & {
  /** The highest tier reached, ever: never lower than `tier` reaches and never lowered. */
  held: Tier;
  counts: LearnShareCounts | BuilderCounts;
};

export type PersonPlaces = { learnShare: LadderPlace; builder: LadderPlace };

export type Recomputed = {
  personId: string;
  /** Null when the person had no position rows yet. */
  before: PersonPlaces | null;
  after: PersonPlaces;
  /** The tiers unlocked by this recompute, bottom first. */
  newTiers: { ladder: Ladder; tier: Tier }[];
  /** The badges found by this recompute, in catalogue order. */
  newBadges: { ladder: UnlockLadder; badge: string }[];
};

/**
 * Which source a recompute's badges are written as, or "skip" to write none.
 * Left out, an event writes badges only once the badges' launch has run, and
 * any other source writes them as itself.
 */
export type BadgeSource = Source | "skip";

/** The highest tier unlock a person holds on a ladder, or null before any. */
export function heldTier(unlocks: readonly UnlockRow[], personId: string, ladder: Ladder): Tier | null {
  let held: Tier | null = null;
  for (const u of unlocks) {
    if (u.person_id !== personId || u.kind !== "tier" || u.ladder !== ladder) continue;
    const tier = u.key as Tier;
    held = held === null ? tier : higherTier(ladder, held, tier);
  }
  return held;
}

function placeFromRow(row: PositionRow, held: Tier | null): LadderPlace {
  const place = placeOn(row.ladder, row.points, held);
  return { ...place, held: held ? higherTier(row.ladder, held, place.tier) : place.tier, counts: row.counts };
}

/** What one person's acts come to on both ladders, before any write. */
export function computePlaces(acts: PersonActs, held: { learnShare: Tier | null; builder: Tier | null }): PersonPlaces {
  const lsCounts = learnShareCounts(acts);
  const lsPoints = learnSharePoints(lsCounts);
  const bCounts = builderCounts(acts);
  const bPoints = builderPoints(acts);
  const learnShare = placeOn("learn_share", lsPoints, held.learnShare);
  const builder = placeOn("builder", bPoints, held.builder);
  return {
    learnShare: { ...learnShare, held: learnShare.tier, counts: lsCounts },
    builder: { ...builder, held: builder.tier, counts: bCounts },
  };
}

/** The position row for a ladder: the tier the points reach, with the division or stars inside it; the held tier lives in the unlocks. */
function positionRow(personId: string, place: LadderPlace, computedAt: string): PositionInsert {
  const reached = placeOn(place.ladder, place.points);
  return {
    person_id: personId,
    ladder: place.ladder,
    points: place.points,
    tier: reached.tier,
    division: reached.division,
    stars: reached.stars,
    immortal_band: reached.immortalBand,
    counts: place.counts,
    computed_at: computedAt,
  };
}

/**
 * Recomputes every person named, in one pass over the doors. Returns, per
 * person, their places before and after and the tiers this pass unlocked.
 */
export async function recomputePeople(personIds: readonly string[], source: Source, deps: Deps = liveDeps(), opts: { badges?: BadgeSource } = {}): Promise<Recomputed[]> {
  if (personIds.length === 0) return [];
  const ids = [...new Set(personIds)];
  const [acts, positions, unlocks] = await Promise.all([gatherActs(ids, deps.doors), deps.store.positionsOf(ids), deps.store.unlocksOf(ids)]);
  const badgeSource: BadgeSource = opts.badges ?? (source !== "event" ? source : (await deps.store.anyUnlock("badge")) ? "event" : "skip");
  const at = deps.now().toISOString();
  const shownAt = source === "launch" ? at : null;
  const positionRows: PositionInsert[] = [];
  const unlockRows: UnlockInsert[] = [];
  const results: Recomputed[] = [];
  for (const personId of ids) {
    const held = { learnShare: heldTier(unlocks, personId, "learn_share"), builder: heldTier(unlocks, personId, "builder") };
    const existing = positions.filter((p) => p.person_id === personId);
    const before = existing.length === 2 ? placesFromRows(existing, held) : null;
    const after = computePlaces(acts.get(personId) ?? { turnIns: [], raids: [], sparks: [], cards: [] }, held);
    const newTiers: Recomputed["newTiers"] = [];
    for (const place of [after.learnShare, after.builder]) {
      positionRows.push(positionRow(personId, place, at));
      const already = held[place.ladder === "learn_share" ? "learnShare" : "builder"];
      for (const tier of tiersReached(place.ladder, place.points)) {
        if (already !== null && tierIndex(place.ladder, tier) <= tierIndex(place.ladder, already)) continue;
        newTiers.push({ ladder: place.ladder, tier });
        unlockRows.push({ person_id: personId, kind: "tier", ladder: place.ladder, key: tier, source, shown_at: shownAt, witness_table: null, witness_id: null });
      }
    }
    results.push({ personId, before, after, newTiers, newBadges: [] });
  }
  if (badgeSource !== "skip") unlockRows.push(...(await badgeUnlocks(results, unlocks, badgeSource, at, deps.doors)));
  await deps.store.writePositions(positionRows);
  await deps.store.writeUnlocks(unlockRows);
  return results;
}

/**
 * The badge unlocks the people's act facts find that they do not hold yet,
 * each with its witness; records them on each person's result. The crossover
 * badges read the points and the tiers held after this recompute.
 */
async function badgeUnlocks(results: Recomputed[], held: readonly UnlockRow[], source: Source, at: string, doors: Doors): Promise<UnlockInsert[]> {
  const ladders = new Map<string, LadderFacts>(
    results.map((r) => [r.personId, { learnSharePoints: r.after.learnShare.points, builderPoints: r.after.builder.points, learnShare: r.after.learnShare.held, builder: r.after.builder.held }]),
  );
  const facts = await gatherActFacts(
    results.map((r) => r.personId),
    doors,
    ladders,
  );
  const rows: UnlockInsert[] = [];
  for (const result of results) {
    const mine = facts.get(result.personId);
    if (!mine) continue;
    const already = new Set(held.filter((u) => u.person_id === result.personId && u.kind === "badge").map((u) => u.key));
    for (const { badge, found } of findBadges(mine)) {
      if (already.has(badge.id)) continue;
      result.newBadges.push({ ladder: badge.ladder, badge: badge.id });
      rows.push({
        person_id: result.personId,
        kind: "badge",
        ladder: badge.ladder,
        key: badge.id,
        source,
        shown_at: source === "launch" ? at : null,
        witness_table: found.witness?.table ?? null,
        witness_id: found.witness?.id ?? null,
      });
    }
  }
  return rows;
}

function placesFromRows(rows: PositionRow[], held: { learnShare: Tier | null; builder: Tier | null }): PersonPlaces | null {
  const ls = rows.find((r) => r.ladder === "learn_share");
  const b = rows.find((r) => r.ladder === "builder");
  if (!ls || !b) return null;
  return { learnShare: placeFromRow(ls, held.learnShare), builder: placeFromRow(b, held.builder) };
}

/** Recomputes one person: the event subscribers' call (LD.2). */
export async function recomputePerson(personId: string, source: Source, deps: Deps = liveDeps(), opts: { badges?: BadgeSource } = {}): Promise<Recomputed> {
  const [result] = await recomputePeople([personId], source, deps, opts);
  return result;
}
