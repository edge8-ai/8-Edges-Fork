import { describe, expect, it } from "vitest";
import type { PositionRow, UnlockRow } from "./rows";
import { myStanding, shapeStanding } from "./standing";
import { display, memoryStore } from "./testing";
import { bordersFrom, wornTiers, wornTiersSeenBy } from "./worn";

// The door tested for its audiences (LD.1; spec "Testing Decisions"; ADR
// 0021): myStanding returns only the reader's own and takes no subject;
// wornTiers returns null for an unworn ladder and never a division, a star or
// a point; wornTiers([id], { profile: true }) returns only switched-on items.

const ME = "person-me";
const MATE = "person-mate";

const position = (person_id: string, ladder: "learn_share" | "builder", over: Partial<PositionRow> = {}): PositionRow =>
  ladder === "learn_share"
    ? { person_id, ladder, points: 450, tier: "gold", division: 2, stars: null, immortal_band: null, counts: { hits: 40, sparks: 5, fires: 0, beacons: 0 }, computed_at: "2026-10-21T19:00:00Z", ...over }
    : { person_id, ladder, points: 9_200.5, tier: "legend", division: null, stars: 3, immortal_band: null, counts: { cards: 41, humanTokens: 920.05 }, computed_at: "2026-10-21T19:00:00Z", ...over };

const unlock = (person_id: string, ladder: "learn_share" | "builder", key: string, shown_at: string | null = "2026-10-21T19:00:00Z"): UnlockRow => ({
  id: `${person_id}-${key}`,
  person_id,
  kind: "tier",
  ladder,
  key,
  unlocked_at: "2026-10-21T19:00:00Z",
  source: "replay",
  shown_at,
});

const seed = () =>
  memoryStore({
    positions: [position(ME, "learn_share"), position(ME, "builder"), position(MATE, "learn_share", { points: 7_000, tier: "challenger", division: 3 }), position(MATE, "builder", { points: 0, tier: "herald", stars: 1 })],
    unlocks: [
      ...["iron", "bronze", "silver", "gold"].map((t) => unlock(ME, "learn_share", t)),
      ...["herald", "guardian", "crusader", "archon", "legend"].map((t) => unlock(ME, "builder", t, t === "legend" ? null : "2026-10-21T19:00:00Z")),
      ...["iron", "bronze", "silver", "gold", "platinum", "emerald", "diamond", "master", "grandmaster", "challenger"].map((t) => unlock(MATE, "learn_share", t)),
      // The teammate once held Guardian; their points fell back to nothing.
      unlock(MATE, "builder", "herald"),
      unlock(MATE, "builder", "guardian"),
    ],
    display: [display({ person_id: MATE, wear_learn_share: true, wear_builder: true, shown_stats: ["hits", "cards"], display_case: ["spark-struck", "anvil-1"], title_badge: "spark-struck" })],
  });

describe("myStanding", () => {
  it("takes the reader alone: one argument, their identity, no subject", () => {
    expect(myStanding.length).toBe(1);
  });

  it("returns the reader's own everything and nothing of anyone else", async () => {
    const s = await myStanding({ personId: ME }, seed());
    expect(s.learnShare).toMatchObject({ points: 450, shown: 450, tier: "gold", tierName: "Gold", division: 2, start: 300, next: { tier: "platinum", start: 600, toGo: 150 }, counts: { hits: 40, sparks: 5 } });
    expect(s.builder).toMatchObject({ points: 9_200.5, shown: 9_200, tier: "legend", stars: 3, next: { tier: "ancient", toGo: 4_799.5 } });
    expect(s.waiting).toEqual([expect.objectContaining({ ladder: "builder", tier: "legend", tierName: "Legend" })]);
    expect(s.display).toMatchObject({ wearLearnShare: false, wearBuilder: false, banner: "meadow", shownStats: [], displayCase: [] });
    expect(s.tables.learnShare.starts.map((t) => t.start)).toEqual([0, 40, 120, 300, 600, 1_000, 1_600, 2_500, 4_000, 6_000, 10_000]);
    expect(JSON.stringify(s)).not.toContain(MATE);
  });

  it("answers a person with no rows yet from the bottom, with nothing waiting", async () => {
    const s = await myStanding({ personId: "person-new" }, seed());
    expect(s.learnShare).toMatchObject({ points: 0, tier: "iron", division: 4, next: { tier: "bronze", toGo: 40 } });
    expect(s.builder).toMatchObject({ points: 0, tier: "herald", stars: 1 });
    expect(s.waiting).toEqual([]);
  });

  it("ignores another person's rows handed to it by mistake", () => {
    const s = shapeStanding({ personId: ME }, { positions: [position(MATE, "learn_share", { points: 7_000 })], unlocks: [], display: [] });
    expect(s.learnShare.points).toBe(0);
  });

  it("keeps a held tier the points no longer reach", async () => {
    const s = await myStanding({ personId: MATE }, seed());
    expect(s.builder).toMatchObject({ points: 0, tier: "guardian", stars: 1 });
  });
});

describe("wornTiers", () => {
  it("returns the tier word for a worn ladder and null for an unworn one, with no division, star or point", async () => {
    const worn = await wornTiers([ME, MATE, "person-new"], { store: seed() });
    expect(worn.get(ME)).toEqual({ learnShare: null, builder: null });
    expect(worn.get(MATE)).toEqual({ learnShare: "challenger", builder: "guardian" });
    expect(worn.get("person-new")).toEqual({ learnShare: null, builder: null });
    for (const value of worn.values()) expect(Object.keys(value).sort()).toEqual(["builder", "learnShare"]);
    expect(JSON.stringify([...worn.values()])).not.toMatch(/7000|division|stars|points/);
  });

  it("wears the held tier, not the one the points reach", async () => {
    // The teammate's Builder points are 0 (Herald) but they hold Guardian.
    const worn = await wornTiers([MATE], { store: seed() });
    expect(worn.get(MATE)?.builder).toBe("guardian");
  });

  it("reads nobody who wears nothing", async () => {
    const store = seed();
    let read: string[] = [];
    store.positionsOf = async (ids) => {
      read = [...ids];
      return [];
    };
    await wornTiers([ME, MATE], { store });
    expect(read).toEqual([MATE]);
  });

  it("answers a dressed profile with only what the person switched on", async () => {
    const profile = await wornTiers([MATE], { profile: true, store: seed() });
    expect(profile).toEqual({
      learnShare: "challenger",
      builder: "guardian",
      banner: "meadow",
      titleBadge: "spark-struck",
      stats: { hits: 40, cards: 41 },
      displayCase: ["spark-struck", "anvil-1"],
    });
  });

  it("answers an undressed profile with nothing", async () => {
    const profile = await wornTiers([ME], { profile: true, store: seed() });
    expect(profile).toEqual({ learnShare: null, builder: null, banner: "meadow", titleBadge: null, stats: {}, displayCase: [] });
  });
});

// LD.4: what the kernel's faces seam asks. The viewer's game style governs
// every border: off, every face they see is plain, whatever the wearer chose.
describe("wornTiersSeenBy", () => {
  const VIEWER = "person-viewer";

  it("shows the wearer's tier to a viewer who never turned the game style off", async () => {
    const worn = await wornTiersSeenBy([ME, MATE], { personId: VIEWER }, seed());
    expect(worn.get(MATE)).toEqual({ learnShare: "challenger", builder: "guardian" });
    expect(worn.get(ME)).toEqual({ learnShare: null, builder: null });
    expect(worn.has(VIEWER)).toBe(false);
  });

  it("shows nothing at all to a viewer whose game style is off", async () => {
    const store = seed();
    store.display.push(display({ person_id: VIEWER, game_style: false }));
    expect(await wornTiersSeenBy([ME, MATE], { personId: VIEWER }, store)).toEqual(new Map());
  });

  it("reads the viewer's choice in the same read as the wearers', once", async () => {
    const store = seed();
    const asked: string[][] = [];
    const displayOf = store.displayOf;
    store.displayOf = async (ids) => {
      asked.push([...ids]);
      return displayOf(ids);
    };
    await wornTiersSeenBy([ME, MATE], { personId: VIEWER }, store);
    expect(asked).toEqual([[ME, MATE, VIEWER]]);
  });

  it("never carries a division, a star or a point", async () => {
    const worn = await wornTiersSeenBy([ME, MATE], { personId: ME }, seed());
    expect(JSON.stringify([...worn])).not.toMatch(/division|stars|points|\d/);
  });

  it("hands the faces seam the Learn & Share tier as the border, and nobody who wears none", async () => {
    // ADR 0026: the kernel's seam carries a border key and no ladder's name.
    const worn = await wornTiersSeenBy([ME, MATE], { personId: VIEWER }, seed());
    expect(bordersFrom(worn)).toEqual(new Map([[MATE, "challenger"]]));
    expect(bordersFrom(new Map([[ME, { learnShare: null, builder: "guardian" }]]))).toEqual(new Map());
  });
});
