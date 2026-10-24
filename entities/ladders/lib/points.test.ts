import { describe, expect, it } from "vitest";
import {
  BUILDER_STARTS,
  BUILDER_TIERS,
  IMMORTAL_BANDS,
  LEARN_SHARE_STARTS,
  LEARN_SHARE_TIERS,
  builderCounts,
  builderPoints,
  cardPoints,
  divisionOf,
  immortalBandOf,
  learnShareCounts,
  learnSharePoints,
  placeOn,
  shownPoints,
  starsOf,
  tierReached,
  tiersReached,
  type CardFact,
  type PersonActs,
  type RaidFact,
  type SparkFact,
  type TurnInFact,
} from "./points";

// The ladders' arithmetic as a table (LD.1; spec "Testing Decisions"): each
// act's points, every tier boundary on both ladders, divisions and stars at
// their edges, the three Immortal bands, and the acts that earn nothing.
// Prior art: entities/quests/lib/fight.test.ts.

const turnIn = (over: Partial<TurnInFact> = {}): TurnInFact => ({ questKind: "bounty", questState: "closed", late: false, turnInUrl: null, ...over });
const raid = (over: Partial<RaidFact> = {}): RaidFact => ({ hostId: "host", held: true, selfLogged: false, attended: ["host", "guest"], ...over });
const spark = (over: Partial<SparkFact> = {}): SparkFact => ({ kind: "learning", archived: false, ...over });
const card = (over: Partial<CardFact> = {}): CardFact => ({ humanTokens: 1, status: "done", completedAt: "2026-10-20T03:00:00Z", archivedAt: null, liveChildren: 0, ...over });
const acts = (over: Partial<PersonActs>): PersonActs => ({ turnIns: [], raids: [], sparks: [], cards: [], ...over });

describe("what each act earns on Learn & Share", () => {
  it.each([
    ["a turn-in on a bounty", acts({ turnIns: [turnIn()] }), 10],
    ["two heads turned in", acts({ turnIns: [turnIn(), turnIn()] }), 20],
    ["a late turn-in counts in full", acts({ turnIns: [turnIn({ late: true })] }), 10],
    ["a turn-in on a bounty later withdrawn still counts", acts({ turnIns: [turnIn({ questState: "withdrawn" })] }), 10],
    ["a turn-in on a raid is not a hit", acts({ turnIns: [turnIn({ questKind: "raid" })] }), 0],
    ["a spark", acts({ sparks: [spark({ kind: "build" })] }), 10],
    ["a learning", acts({ sparks: [spark({ kind: "learning" })] }), 10],
    ["an archived spark earns nothing", acts({ sparks: [spark({ archived: true })] }), 0],
    ["a raid hosted that someone came to", acts({ raids: [raid()] }), 100],
    ["a raid with only its host on the register earns nothing", acts({ raids: [raid({ attended: ["host"] })] }), 0],
    ["a raid nobody came to earns nothing", acts({ raids: [raid({ attended: [] })] }), 0],
    ["a cancelled or sessionless raid earns nothing", acts({ raids: [raid({ held: false })] }), 0],
    ["a self-logged session earns nothing", acts({ raids: [raid({ selfLogged: true })] }), 0],
    ["one raid is one fire however many came", acts({ raids: [raid({ attended: ["a", "b", "c", "host"] })] }), 100],
    ["a beacon lit", acts({ turnIns: [turnIn({ questKind: "beacon", turnInUrl: "https://example.com/talk" })] }), 250],
    ["a beacon turned in without its link is not lit", acts({ turnIns: [turnIn({ questKind: "beacon" })] }), 0],
    ["everything together", acts({ turnIns: [turnIn(), turnIn({ questKind: "beacon", turnInUrl: "https://x" })], sparks: [spark()], raids: [raid()] }), 370],
  ] as const)("%s", (_name, a, expected) => {
    expect(learnSharePoints(learnShareCounts(a))).toBe(expected);
  });

  it("counts each act under its own name", () => {
    const a = acts({ turnIns: [turnIn(), turnIn(), turnIn({ questKind: "beacon", turnInUrl: "https://x" })], sparks: [spark(), spark({ archived: true })], raids: [raid(), raid({ attended: [] })] });
    expect(learnShareCounts(a)).toEqual({ hits: 2, sparks: 1, fires: 1, beacons: 1 });
  });
});

describe("what each act earns on Builder", () => {
  it.each([
    ["a leaf card of 1 Human Token", [card()], 10],
    ["a leaf card of 0.05", [card({ humanTokens: 0.05 })], 0.5],
    ["a leaf card of 0.15 (float trap)", [card({ humanTokens: 0.15 })], 1.5],
    ["a leaf card of 2.35", [card({ humanTokens: 2.35 })], 23.5],
    ["an unsized leaf card", [card({ humanTokens: null })], 3],
    ["a parent card with a live child earns nothing", [card({ humanTokens: 9, liveChildren: 2 })], 0],
    ["a card whose children are all archived is a leaf", [card({ humanTokens: 9, liveChildren: 0 })], 90],
    ["an open card earns nothing", [card({ status: "open", completedAt: null })], 0],
    ["a done card with no completion time earns nothing", [card({ completedAt: null })], 0],
    ["an archived card earns nothing", [card({ archivedAt: "2026-10-01T00:00:00Z" })], 0],
    ["a not-doing card earns nothing", [card({ status: "not_doing" })], 0],
    ["many small cards sum exactly", Array.from({ length: 7 }, () => card({ humanTokens: 0.15 })), 10.5],
  ] as const)("%s", (_name, cards, expected) => {
    expect(builderPoints(acts({ cards: [...cards] }))).toBe(expected);
  });

  it("counts the shipped leaves and the Human Tokens on them", () => {
    expect(builderCounts(acts({ cards: [card({ humanTokens: 0.3 }), card({ humanTokens: null }), card({ humanTokens: 2, liveChildren: 1 })] }))).toEqual({ cards: 2, humanTokens: 0.3 });
  });

  it("prices one card", () => {
    expect(cardPoints(0.05)).toBe(0.5);
    expect(cardPoints(null)).toBe(3);
  });
});

describe("where each Learn & Share tier starts", () => {
  it.each([
    [0, "iron"],
    [39, "iron"],
    [40, "bronze"],
    [119, "bronze"],
    [120, "silver"],
    [299, "silver"],
    [300, "gold"],
    [599, "gold"],
    [600, "platinum"],
    [999, "platinum"],
    [1_000, "emerald"],
    [1_599, "emerald"],
    [1_600, "diamond"],
    [2_499, "diamond"],
    [2_500, "master"],
    [3_999, "master"],
    [4_000, "grandmaster"],
    [5_999, "grandmaster"],
    [6_000, "challenger"],
    [9_999, "challenger"],
    [10_000, "sovereign"],
    [250_000, "sovereign"],
  ] as const)("%i points is %s", (points, tier) => {
    expect(tierReached("learn_share", points)).toBe(tier);
  });

  it("pins the table from the spec", () => {
    expect(LEARN_SHARE_TIERS.map((t) => [t, LEARN_SHARE_STARTS[t]])).toEqual([
      ["iron", 0], ["bronze", 40], ["silver", 120], ["gold", 300], ["platinum", 600], ["emerald", 1_000], ["diamond", 1_600], ["master", 2_500], ["grandmaster", 4_000], ["challenger", 6_000], ["sovereign", 10_000],
    ]);
  });
});

describe("where each Builder medal starts", () => {
  it.each([
    [0, "herald"],
    [299.5, "herald"],
    [300, "guardian"],
    [999.9, "guardian"],
    [1_000, "crusader"],
    [2_499.9, "crusader"],
    [2_500, "archon"],
    [5_999.9, "archon"],
    [6_000, "legend"],
    [13_999.9, "legend"],
    [14_000, "ancient"],
    [29_999.9, "ancient"],
    [30_000, "divine"],
    [59_999.5, "divine"],
    [60_000, "immortal"],
    [120_000, "immortal"],
    [250_000, "immortal"],
  ] as const)("%d points is %s", (points, tier) => {
    expect(tierReached("builder", points)).toBe(tier);
  });

  it("pins the table from the spec", () => {
    expect(BUILDER_TIERS.map((t) => [t, BUILDER_STARTS[t]])).toEqual([
      ["herald", 0], ["guardian", 300], ["crusader", 1_000], ["archon", 2_500], ["legend", 6_000], ["ancient", 14_000], ["divine", 30_000], ["immortal", 60_000],
    ]);
    expect(IMMORTAL_BANDS).toEqual([60_000, 120_000, 250_000]);
  });
});

describe("divisions", () => {
  it.each([
    [300, "gold", 4],
    [374, "gold", 4],
    [374.9, "gold", 4],
    [375, "gold", 3],
    [449, "gold", 3],
    [450, "gold", 2],
    [524, "gold", 2],
    [525, "gold", 1],
    [599, "gold", 1],
    [0, "iron", 4],
    [9, "iron", 4],
    [10, "iron", 3],
    [20, "iron", 2],
    [30, "iron", 1],
    [39, "iron", 1],
    [6_000, "challenger", 4],
    [7_000, "challenger", 3],
    [9_999, "challenger", 1],
    [10_000, "sovereign", null],
    [50_000, "sovereign", null],
  ] as const)("%d points in %s is division %s", (points, tier, division) => {
    expect(divisionOf(points, tier)).toBe(division);
  });

  it("sits at IV when a held tier outranks the points", () => {
    expect(divisionOf(100, "gold")).toBe(4);
  });
});

describe("stars", () => {
  it.each([
    [6_000, "legend", 1],
    [7_599, "legend", 1],
    [7_600, "legend", 2],
    [9_199, "legend", 2],
    [9_200, "legend", 3],
    [10_799, "legend", 3],
    [10_800, "legend", 4],
    [12_399, "legend", 4],
    [12_400, "legend", 5],
    [13_999.9, "legend", 5],
    [0, "herald", 1],
    [60, "herald", 2],
    [240, "herald", 5],
    [30_000, "divine", 1],
    [59_999.5, "divine", 5],
    [60_000, "immortal", null],
  ] as const)("%d points in %s is %s stars", (points, tier, stars) => {
    expect(starsOf(points, tier)).toBe(stars);
  });

  it("sits at one star when a held medal outranks the points", () => {
    expect(starsOf(100, "legend")).toBe(1);
  });
});

describe("the three Immortal bands", () => {
  it.each([
    [59_999.9, null],
    [60_000, 1],
    [119_999.9, 1],
    [120_000, 2],
    [249_999.9, 2],
    [250_000, 3],
    [1_000_000, 3],
  ] as const)("%d points wears band %s", (points, band) => {
    expect(immortalBandOf(points)).toBe(band);
  });
});

describe("placeOn", () => {
  it("places Learn & Share points in their tier and division", () => {
    expect(placeOn("learn_share", 450)).toEqual({ ladder: "learn_share", points: 450, tier: "gold", division: 2, stars: null, immortalBand: null });
  });

  it("places Builder points in their medal and stars", () => {
    expect(placeOn("builder", 9_200)).toEqual({ ladder: "builder", points: 9_200, tier: "legend", division: null, stars: 3, immortalBand: null });
  });

  it("places an Immortal in a band with no stars", () => {
    expect(placeOn("builder", 130_000)).toEqual({ ladder: "builder", points: 130_000, tier: "immortal", division: null, stars: null, immortalBand: 2 });
  });

  it("places a Sovereign with no division", () => {
    expect(placeOn("learn_share", 12_000).division).toBeNull();
  });

  it("keeps a held tier the points no longer reach, at its floor", () => {
    // A card taken out of Done lowered the points; the medal stays.
    expect(placeOn("builder", 5_000, "legend")).toMatchObject({ tier: "legend", stars: 1 });
    expect(placeOn("learn_share", 100, "gold")).toMatchObject({ tier: "gold", division: 4 });
  });

  it("never lets a held tier lower the reached one", () => {
    expect(placeOn("learn_share", 700, "bronze").tier).toBe("platinum");
  });
});

describe("tiersReached", () => {
  it("lists the tier reached and every tier below it, bottom first", () => {
    expect(tiersReached("learn_share", 0)).toEqual(["iron"]);
    expect(tiersReached("learn_share", 320)).toEqual(["iron", "bronze", "silver", "gold"]);
    expect(tiersReached("builder", 60_000)).toEqual([...BUILDER_TIERS]);
  });
});

describe("shownPoints", () => {
  it("rounds down to a whole number while thresholds keep the exact value", () => {
    expect(shownPoints(299.5)).toBe(299);
    expect(tierReached("builder", 299.5)).toBe("herald");
    expect(shownPoints(10.5)).toBe(10);
  });
});
