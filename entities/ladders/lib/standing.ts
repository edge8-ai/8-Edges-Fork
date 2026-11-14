// myStanding: everything, for the reader about the reader (LD.1; spec "The
// door"; ADR 0021). It takes the reader's identity and never a subject id, so
// there is no way to ask it about anyone else: the fence is the signature.
// The fetch and the shaping are split so the audience rule is tested on rows
// in memory.
import {
  BUILDER_POINTS,
  BUILDER_STARTS,
  BUILDER_TIERS,
  IMMORTAL_BANDS,
  LEARN_SHARE_POINTS,
  LEARN_SHARE_STARTS,
  LEARN_SHARE_TIERS,
  nextTier,
  placeOn,
  shownPoints,
  tierName,
  tierStart,
  type BuilderCounts,
  type Ladder,
  type LearnShareCounts,
  type Tier,
  tierIndex,
} from "./points";
import type { WitnessTable } from "./badge-acts";
import { badgeById, BADGES } from "./badges";
import { heldTier } from "./recompute";
import type { Banner, DisplayRow, PositionRow, UnlockRow, UnlockSource } from "./rows";
import { liveStore, type Store } from "./store";

/** Who is asking. The reader's own identity, as the team guard hands it to a page. */
export type Reader = { personId: string };

export type LadderStanding = {
  ladder: Ladder;
  /** Exact, to one decimal place; `shown` is what a page prints. */
  points: number;
  shown: number;
  /** The tier held: the highest reached, never lowered. */
  tier: Tier;
  tierName: string;
  division: 1 | 2 | 3 | 4 | null;
  stars: 1 | 2 | 3 | 4 | 5 | null;
  immortalBand: 1 | 2 | 3 | null;
  /** Where the held tier starts. */
  start: number;
  /** The bar to the next tier; null at the open top. */
  next: { tier: Tier; tierName: string; start: number; toGo: number } | null;
  counts: LearnShareCounts | BuilderCounts;
};

/** The person's own choices, as ladder_display holds them; the defaults when they have chosen nothing yet. */
export type DisplayChoices = {
  wearLearnShare: boolean;
  wearBuilder: boolean;
  banner: Banner;
  titleBadge: string | null;
  shownStats: string[];
  displayCase: string[];
  /** The game style (QS.11): off quiets the rank-up and the badge drops (LD.5, LD.7), and shows Quests plainly. */
  gameStyle: boolean;
};

export type WaitingUnlock = { id: string; ladder: Ladder; tier: Tier; tierName: string; unlockedAt: string };

export type Standing = {
  learnShare: LadderStanding;
  builder: LadderStanding;
  /** The points tables and where each tier starts, printed beside the bar. */
  tables: {
    learnShare: { acts: typeof LEARN_SHARE_POINTS; starts: { tier: Tier; tierName: string; start: number }[] };
    builder: { acts: typeof BUILDER_POINTS; starts: { tier: Tier; tierName: string; start: number }[]; immortalBands: readonly number[] };
  };
  display: DisplayChoices;
  /** Tier unlocks not yet shown: the rank-ups waiting (LD.5). */
  waiting: WaitingUnlock[];
  /**
   * The badges the reader found (LD.7), in the catalogue's order: the unlock's
   * id, the badge's id and name, when it was found, and whether it has been
   * shown to them yet (history credited at the launch was). The reader's own
   * and nobody else's; wornTiers never reads a badge unlock.
   */
  badgesFound: BadgeFound[];
};

export type BadgeFound = {
  id: string;
  key: string;
  name: string;
  unlockedAt: string;
  shown: boolean;
  /**
   * How it was found (LD.7b): by an act just now ("event"), by the nightly
   * replay, or credited at the launch. Only an event's badge drops on a page;
   * the replay's waits on the Achievements tab.
   */
  source: UnlockSource;
  /** The table of the row that proves it, which says on which page it drops; null when no row does. */
  witnessTable: WitnessTable | null;
};

export const NO_CHOICES: DisplayChoices = { wearLearnShare: false, wearBuilder: false, banner: "meadow", titleBadge: null, shownStats: [], displayCase: [], gameStyle: true };

const EMPTY_LS: LearnShareCounts = { hits: 0, sparks: 0, fires: 0, beacons: 0 };
const EMPTY_B: BuilderCounts = { cards: 0, humanTokens: 0 };

function standingOn(ladder: Ladder, row: PositionRow | undefined, held: Tier | null): LadderStanding {
  const points = row?.points ?? 0;
  const place = placeOn(ladder, points, held);
  const next = nextTier(ladder, place.tier);
  const start = tierStart(ladder, place.tier);
  return {
    ladder,
    points,
    shown: shownPoints(points),
    tier: place.tier,
    tierName: tierName(place.tier),
    division: place.division,
    stars: place.stars,
    immortalBand: place.immortalBand,
    start,
    next: next ? { tier: next, tierName: tierName(next), start: tierStart(ladder, next), toGo: Math.max(0, tierStart(ladder, next) - points) } : null,
    counts: row?.counts ?? (ladder === "learn_share" ? EMPTY_LS : EMPTY_B),
  };
}

export function choicesOf(row: DisplayRow | undefined): DisplayChoices {
  if (!row) return NO_CHOICES;
  return { wearLearnShare: row.wear_learn_share, wearBuilder: row.wear_builder, banner: row.banner, titleBadge: row.title_badge, shownStats: row.shown_stats, displayCase: row.display_case, gameStyle: row.game_style };
}

const TABLES: Standing["tables"] = {
  learnShare: { acts: LEARN_SHARE_POINTS, starts: LEARN_SHARE_TIERS.map((tier) => ({ tier, tierName: tierName(tier), start: LEARN_SHARE_STARTS[tier] })) },
  builder: { acts: BUILDER_POINTS, starts: BUILDER_TIERS.map((tier) => ({ tier, tierName: tierName(tier), start: BUILDER_STARTS[tier] })), immortalBands: IMMORTAL_BANDS },
};

/**
 * The reader's standing from rows. Only rows of the reader are read; any
 * other person's row handed in is ignored, so a careless fetch cannot widen
 * the answer.
 */
export function shapeStanding(reader: Reader, rows: { positions: PositionRow[]; unlocks: UnlockRow[]; display: DisplayRow[] }): Standing {
  const mine = {
    positions: rows.positions.filter((r) => r.person_id === reader.personId),
    unlocks: rows.unlocks.filter((r) => r.person_id === reader.personId),
    display: rows.display.find((r) => r.person_id === reader.personId),
  };
  const held = { learnShare: heldTier(mine.unlocks, reader.personId, "learn_share"), builder: heldTier(mine.unlocks, reader.personId, "builder") };
  return {
    learnShare: standingOn("learn_share", mine.positions.find((r) => r.ladder === "learn_share"), held.learnShare),
    builder: standingOn("builder", mine.positions.find((r) => r.ladder === "builder"), held.builder),
    tables: TABLES,
    display: choicesOf(mine.display),
    // The bottom tier (Iron, Herald) is where everyone starts: its unlock is
    // written by a person's first act and is no climb, so it never waits to be
    // shown (LD.5). Filtering it here keeps every reader of `waiting`, the gate
    // and later the next-move slot, from counting a rank-up that will never open.
    waiting: mine.unlocks
      .filter((u) => u.kind === "tier" && u.shown_at === null && u.ladder !== "both" && tierIndex(u.ladder as Ladder, u.key as Tier) > 0)
      .map((u) => ({ id: u.id, ladder: u.ladder as Ladder, tier: u.key as Tier, tierName: tierName(u.key as Tier), unlockedAt: u.unlocked_at })),
    badgesFound: badgesFound(mine.unlocks),
  };
}

/** The badge unlocks among a reader's own, in catalogue order; a key the catalogue no longer holds keeps its id as its name. */
function badgesFound(unlocks: readonly UnlockRow[]): BadgeFound[] {
  const order = new Map(BADGES.map((b, i) => [b.id, i]));
  return unlocks
    .filter((u) => u.kind === "badge")
    .map((u) => ({ id: u.id, key: u.key, name: badgeById(u.key)?.name ?? u.key, unlockedAt: u.unlocked_at, shown: u.shown_at !== null, source: u.source, witnessTable: (u.witness_table as WitnessTable | null) ?? null }))
    .sort((a, b) => (order.get(a.key) ?? BADGES.length) - (order.get(b.key) ?? BADGES.length));
}

/** The reader's own standing: both ladders, the tables, their choices and what waits to be shown. */
export async function myStanding(reader: Reader, store: Store = liveStore): Promise<Standing> {
  const ids = [reader.personId];
  const [positions, unlocks, display] = await Promise.all([store.positionsOf(ids), store.unlocksOf(ids), store.displayOf(ids)]);
  return shapeStanding(reader, { positions, unlocks, display });
}
