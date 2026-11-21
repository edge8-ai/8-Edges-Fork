import { describe, expect, it } from "vitest";
import { divisionStart, learnSharePlace, nextPlace, reachAfter } from "./learn-share-place";
import { shapeStanding } from "./standing";
import type { PositionRow, UnlockRow } from "./rows";
import { display } from "./testing";

// Quests' next move (QS.13) reads the reader's Learn & Share position through
// this one pure answer: the bar between this division and the next, what each
// act earns and where it would take them. The tier starts are the ladders
// spec's (Gold IV 300, III 375, II 450, I 525).

const ME = "person-me";
const row = (points: number): PositionRow => ({
  person_id: ME, ladder: "learn_share", points, tier: "iron", division: 4, stars: null, immortal_band: null, counts: { hits: 0, sparks: 0, fires: 0, beacons: 0 }, computed_at: "2026-10-23T00:00:00Z",
});
const held = (key: string): UnlockRow => ({ id: `u-${key}`, person_id: ME, kind: "tier", ladder: "learn_share", key, unlocked_at: "2026-10-23T00:00:00Z", source: "event", shown_at: "2026-10-23T00:00:00Z" });
const standing = (points: number, unlocks: UnlockRow[] = []) => shapeStanding({ personId: ME }, { positions: [row(points)], unlocks, display: [display({ person_id: ME })] }).learnShare;

describe("divisionStart and nextPlace", () => {
  it.each([
    ["gold", 4, 300],
    ["gold", 3, 375],
    ["gold", 2, 450],
    ["gold", 1, 525],
    ["iron", 4, 0],
    ["iron", 1, 30],
    ["challenger", 1, 9_000],
  ] as const)("%s %s starts at %s", (tier, division, start) => {
    expect(divisionStart(tier, division)).toBe(start);
  });

  it("is the next division up, then the next tier's IV, and nothing at the open top", () => {
    expect(nextPlace("gold", 3)).toMatchObject({ tierName: "Gold", division: 2, start: 450, words: { game: "Gold II", plain: "Gold, division II" } });
    expect(nextPlace("gold", 1)).toMatchObject({ tierName: "Platinum", division: 4, start: 600 });
    expect(nextPlace("challenger", 1)).toMatchObject({ tierName: "Sovereign", division: null, start: 10_000, words: { game: "Sovereign", plain: "Sovereign" } });
    expect(nextPlace("sovereign", null)).toBeNull();
  });
});

describe("learnSharePlace", () => {
  it("reads Gold III at 400, with the bar from 375 to 450 and every act's points", () => {
    const p = learnSharePlace(standing(400));
    expect(p).toMatchObject({ tierName: "Gold", division: 3, points: 400, divisionStart: 375, words: { game: "Gold III", plain: "Gold, division III" }, next: { start: 450, tierName: "Gold", division: 2 } });
    expect(p.pointsFor).toEqual({ hit: 10, learning: 10, fire: 100, beacon: 250 });
  });

  it.each([
    // points, act, where it lands, new tier
    [400, "hit", "Gold", 3, false],
    [440, "learning", "Gold", 2, false],
    [400, "fire", "Gold", 2, false],
    [520, "fire", "Platinum", 4, true],
    [400, "beacon", "Platinum", 4, true],
    [295, "hit", "Gold", 4, true],
    [0, "learning", "Iron", 3, false],
  ] as const)("at %s, a %s reaches %s %s (new tier: %s)", (points, act, tierName, division, newTier) => {
    expect(learnSharePlace(standing(points)).reaches[act]).toMatchObject({ tierName, division, newTier });
  });

  it("shows whole points and works from the exact ones", () => {
    const p = learnSharePlace(standing(449.5));
    expect(p.points).toBe(449);
    expect(p.reaches.hit).toMatchObject({ tierName: "Gold", division: 2, newTier: false });
  });

  it("keeps the tier held when the points sit below it, so an act there is no new tier", () => {
    const s = standing(280, [held("gold")]);
    expect(s.tier).toBe("gold");
    expect(learnSharePlace(s)).toMatchObject({ tierName: "Gold", division: 4, divisionStart: 300, next: { start: 375 } });
    expect(reachAfter(s, 10)).toMatchObject({ tierName: "Gold", division: 4, newTier: false });
  });

  it("has no next place at Sovereign, the open top", () => {
    const p = learnSharePlace(standing(12_000));
    expect(p).toMatchObject({ tierName: "Sovereign", division: null, next: null, divisionStart: 10_000 });
    expect(p.reaches.beacon).toMatchObject({ tierName: "Sovereign", division: null, newTier: false });
  });
});
