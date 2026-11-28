// The ladders' arithmetic (LD.1; spec 2026-10-21, "Points and tiers"; ADR
// 0021), pure. The canonical points tables, where each tier starts, the
// divisions and stars inside a tier, and the three Immortal bands. Nothing
// here reads a table: which rows are acts is decided once, beside the badges'
// acts (badge-acts.ts), and this module says what the acts are worth.
//
// Vocabulary is the glossary's (entities/ladders/GLOSSARY.md): an Act earns
// Points on one Ladder; Points reach a Tier, split into Divisions (Learn &
// Share, IV up to I) or Stars (Builder, one to five); Sovereign and Immortal
// are the open tops, and Immortal's medal changes twice as it grows (the
// Immortal bands). No XP, no score, no level.

export type Ladder = "learn_share" | "builder";

/** Each ladder's name as the product says it; one copy, read by the panel, the switches and the rank-up. */
export const LADDER_WORDS: Record<Ladder, string> = { learn_share: "Learn & Share", builder: "Builder" };

export const LEARN_SHARE_TIERS = ["iron", "bronze", "silver", "gold", "platinum", "emerald", "diamond", "master", "grandmaster", "challenger", "sovereign"] as const;
export type LearnShareTier = (typeof LEARN_SHARE_TIERS)[number];

export const BUILDER_TIERS = ["herald", "guardian", "crusader", "archon", "legend", "ancient", "divine", "immortal"] as const;
export type BuilderTier = (typeof BUILDER_TIERS)[number];

export type Tier = LearnShareTier | BuilderTier;

/** Where each Learn & Share tier starts, in points. Absolute, never a share of people. */
export const LEARN_SHARE_STARTS: Record<LearnShareTier, number> = {
  iron: 0,
  bronze: 40,
  silver: 120,
  gold: 300,
  platinum: 600,
  emerald: 1_000,
  diamond: 1_600,
  master: 2_500,
  grandmaster: 4_000,
  challenger: 6_000,
  sovereign: 10_000,
};

/** Where each Builder medal starts, in points. */
export const BUILDER_STARTS: Record<BuilderTier, number> = {
  herald: 0,
  guardian: 300,
  crusader: 1_000,
  archon: 2_500,
  legend: 6_000,
  ancient: 14_000,
  divine: 30_000,
  immortal: 60_000,
};

/** Immortal's three medals: the band changes the art and nothing else. */
export const IMMORTAL_BANDS = [60_000, 120_000, 250_000] as const;

/** Learn & Share: what each act earns. */
export const LEARN_SHARE_POINTS = {
  /** A Turn-in on a Bounty, a head. */
  hit: 10,
  /** A spark or a learning in Spark. */
  spark: 10,
  /** A Raid hosted that someone came to. */
  fire: 100,
  /** A Beacon lit. */
  beacon: 250,
} as const;

/** Builder: what each act earns. */
export const BUILDER_POINTS = {
  /** A leaf card moved to Done: its Human Tokens times this. */
  perHumanToken: 10,
  /** An unsized leaf card moved to Done. */
  unsizedCard: 3,
} as const;

// ---------------------------------------------------------------------------
// What the acts are worth. Every act is counted from the person's act facts,
// the one record the badges read too (ADR 0023): a hit, a spark, a Beacon lit,
// a fire and a shipped leaf card are each defined once, in badge-acts.ts, and
// handed here already chosen.
// ---------------------------------------------------------------------------

/** A shipped leaf card, as far as its points go: its size. */
export type LeafCard = { humanTokens: number | null };

/**
 * Points for one shipped leaf card, in tenths, so a sum of many stays exact:
 * a 0.05 card is 5 tenths (0.5 points), an unsized one 30. Floats would make
 * 0.15 × 10 into 1.5000000000000002 and a sum of cards drift from the one
 * decimal the table stores.
 */
export function cardTenths(humanTokens: number | null): number {
  if (humanTokens === null) return BUILDER_POINTS.unsizedCard * 10;
  return Math.round(humanTokens * BUILDER_POINTS.perHumanToken * 10);
}

/** Points for one shipped leaf card, to one decimal place. */
export const cardPoints = (humanTokens: number | null): number => cardTenths(humanTokens) / 10;

export type LearnShareCounts = { hits: number; sparks: number; fires: number; beacons: number };
export type BuilderCounts = { cards: number; humanTokens: number };

export function learnSharePoints(counts: LearnShareCounts): number {
  return counts.hits * LEARN_SHARE_POINTS.hit + counts.sparks * LEARN_SHARE_POINTS.spark + counts.fires * LEARN_SHARE_POINTS.fire + counts.beacons * LEARN_SHARE_POINTS.beacon;
}

/** The shipped leaf cards and the Human Tokens on them (an unsized card adds none). */
export function builderCounts(leaves: readonly LeafCard[]): BuilderCounts {
  // Human Tokens sit on a 0.05 grid, so hundredths are exact integers.
  const hundredths = leaves.reduce((sum, c) => sum + Math.round((c.humanTokens ?? 0) * 100), 0);
  return { cards: leaves.length, humanTokens: hundredths / 100 };
}

/** Builder points for the shipped leaf cards, to one decimal place, summed in tenths. */
export function builderPoints(leaves: readonly LeafCard[]): number {
  const tenths = leaves.reduce((sum, c) => sum + cardTenths(c.humanTokens), 0);
  return tenths / 10;
}

// ---------------------------------------------------------------------------
// Tiers, divisions, stars and bands.
// ---------------------------------------------------------------------------

export function tiersOf(ladder: Ladder): readonly Tier[] {
  return ladder === "learn_share" ? LEARN_SHARE_TIERS : BUILDER_TIERS;
}

export function tierStart(ladder: Ladder, tier: Tier): number {
  return ladder === "learn_share" ? LEARN_SHARE_STARTS[tier as LearnShareTier] : BUILDER_STARTS[tier as BuilderTier];
}

/** The tier's place on its ladder, bottom first; higher is later. */
export function tierIndex(ladder: Ladder, tier: Tier): number {
  const i = tiersOf(ladder).indexOf(tier);
  if (i < 0) throw new Error(`${tier} is not a ${ladder} tier`);
  return i;
}

/** The tier the points reach: the highest whose start they meet. Thresholds compare the exact value. */
export function tierReached(ladder: Ladder, points: number): Tier {
  const tiers = tiersOf(ladder);
  let reached: Tier = tiers[0];
  for (const tier of tiers) {
    if (points >= tierStart(ladder, tier)) reached = tier;
  }
  return reached;
}

/** Every tier the points reach, bottom first: the one reached and all below it. */
export function tiersReached(ladder: Ladder, points: number): Tier[] {
  const tiers = tiersOf(ladder);
  return tiers.slice(0, tierIndex(ladder, tierReached(ladder, points)) + 1);
}

/** The tier above, or null at the open top. */
export function nextTier(ladder: Ladder, tier: Tier): Tier | null {
  const tiers = tiersOf(ladder);
  return tiers[tierIndex(ladder, tier) + 1] ?? null;
}

/** The higher of two tiers on one ladder. */
export function higherTier(ladder: Ladder, a: Tier, b: Tier): Tier {
  return tierIndex(ladder, a) >= tierIndex(ladder, b) ? a : b;
}

/**
 * The Division inside a Learn & Share tier: IV (4) from the tier's start, I (1)
 * from three quarters of the way to the next (Gold IV 300, III 375, II 450,
 * I 525). Null at Sovereign. Points below the tier's start, which happens
 * only when a held tier outranks the points, sit at IV.
 */
export function divisionOf(points: number, tier: LearnShareTier): 1 | 2 | 3 | 4 | null {
  const next = nextTier("learn_share", tier);
  if (next === null) return null;
  const start = LEARN_SHARE_STARTS[tier];
  const quarter = (LEARN_SHARE_STARTS[next as LearnShareTier] - start) / 4;
  const steps = Math.floor((points - start) / quarter);
  return Math.max(1, Math.min(4, 4 - steps)) as 1 | 2 | 3 | 4;
}

/**
 * The Stars inside a Builder medal: one on reaching it, five at four fifths of
 * the way to the next (Legend ★ 6,000, ★★ 7,600, ★★★ 9,200, ★★★★ 10,800,
 * ★★★★★ 12,400). Null at Immortal. Points below the medal's start sit at one.
 */
export function starsOf(points: number, tier: BuilderTier): 1 | 2 | 3 | 4 | 5 | null {
  const next = nextTier("builder", tier);
  if (next === null) return null;
  const start = BUILDER_STARTS[tier];
  const fifth = (BUILDER_STARTS[next as BuilderTier] - start) / 5;
  const steps = Math.floor((points - start) / fifth);
  return Math.max(1, Math.min(5, 1 + steps)) as 1 | 2 | 3 | 4 | 5;
}

/** Which Immortal medal the points wear; null below Immortal. */
export function immortalBandOf(points: number): 1 | 2 | 3 | null {
  if (points >= IMMORTAL_BANDS[2]) return 3;
  if (points >= IMMORTAL_BANDS[1]) return 2;
  if (points >= IMMORTAL_BANDS[0]) return 1;
  return null;
}

/** A person's place on one ladder, as the position row stores it. */
export type Place = {
  ladder: Ladder;
  points: number;
  tier: Tier;
  division: 1 | 2 | 3 | 4 | null;
  stars: 1 | 2 | 3 | 4 | 5 | null;
  immortalBand: 1 | 2 | 3 | null;
};

/**
 * Where the points sit on a ladder. `held` is the tier the person already
 * holds (their highest tier unlock): when it outranks what the points reach,
 * the place is on the held tier, at its floor, because a corrected source row
 * may lower points but never a tier (ADR 0021, "only up").
 */
export function placeOn(ladder: Ladder, points: number, held?: Tier | null): Place {
  const reached = tierReached(ladder, points);
  const tier = held ? higherTier(ladder, reached, held) : reached;
  if (ladder === "learn_share") {
    return { ladder, points, tier, division: divisionOf(points, tier as LearnShareTier), stars: null, immortalBand: null };
  }
  const band = tier === "immortal" ? (immortalBandOf(points) ?? 1) : null;
  return { ladder, points, tier, division: null, stars: starsOf(points, tier as BuilderTier), immortalBand: band };
}

/** Points as a page shows them: rounded down to a whole number. */
export const shownPoints = (points: number): number => Math.floor(points);

/** The tier's name as a page prints it. */
export function tierName(tier: Tier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}
