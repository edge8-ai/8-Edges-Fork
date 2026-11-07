import { describe, expect, it } from "vitest";
import { pickRankUp, praiseFor } from "./rank-up";
import type { PositionRow, UnlockRow } from "./rows";
import { shapeStanding } from "./standing";
import { display } from "./testing";
import type { Tier } from "./points";

// Which rank-up opens, and what it says (LD.5; spec "The rank-up"). A waiting
// tier unlock is a rank-up nobody has seen; the reader sees the highest one,
// worded as the approved prototype words it, and nothing opens for a division,
// a star, a badge, the tier everyone starts on, or an unlock already shown.

const ME = "person-me";
const T0 = "2026-10-23T09:00:00.000Z";
const T1 = "2026-10-23T09:05:00.000Z";

const ls = (points: number, tier: Tier, division: 1 | 2 | 3 | 4 | null): PositionRow => ({
  person_id: ME, ladder: "learn_share", points, tier, division, stars: null, immortal_band: null, counts: { hits: 4, sparks: 0, fires: 0, beacons: 0 }, computed_at: T0,
});
const b = (points: number, tier: Tier, stars: 1 | 2 | 3 | 4 | 5 | null, band: 1 | 2 | 3 | null = null): PositionRow => ({
  person_id: ME, ladder: "builder", points, tier, division: null, stars, immortal_band: band, counts: { cards: 1, humanTokens: 1 }, computed_at: T0,
});
const unlock = (ladder: UnlockRow["ladder"], key: string, over: Partial<UnlockRow> = {}): UnlockRow => ({
  id: `u-${ladder}-${key}`, person_id: ME, kind: "tier", ladder, key, unlocked_at: T0, source: "event", shown_at: null, ...over,
});
const shown = { shown_at: T0, source: "launch" as const };

const standing = (positions: PositionRow[], unlocks: UnlockRow[], gameStyle = true) =>
  shapeStanding({ personId: ME }, { positions, unlocks, display: [display({ person_id: ME, game_style: gameStyle })] });

describe("pickRankUp", () => {
  it("opens Bronze when 30 points become 40 on Learn & Share, worded as the prototype words it", () => {
    const s = standing([ls(40, "bronze", 4), b(0, "herald", 1)], [unlock("learn_share", "iron", shown), unlock("builder", "herald", shown), unlock("learn_share", "bronze")]);
    expect(pickRankUp(s)).toEqual({
      unlockId: "u-learn_share-bronze",
      markIds: ["u-learn_share-bronze"],
      ladder: "learn_share",
      tier: "bronze",
      tierName: "Bronze",
      band: null,
      place: "Learn & Share · Bronze IV",
      praise: "Every hit, every spark, every fire you lit added up. Bronze suits you.",
      gameOn: true,
    });
  });

  it("says Gold and Archon in the prototype's own words", () => {
    expect(praiseFor("learn_share", "Gold", true)).toBe("Every hit, every spark, every fire you lit added up. Gold suits you.");
    expect(praiseFor("builder", "Archon", true)).toBe("Real work, shipped and landed. The forge hands you a new medal.");
    const s = standing([ls(10, "iron", 4), b(2_500, "archon", 1)], [unlock("learn_share", "iron", shown), unlock("builder", "herald", shown), unlock("builder", "archon")]);
    expect(pickRankUp(s)?.place).toBe("Builder · Archon ★");
  });

  it("shows the highest of several tiers reached at once, and marks the ones beneath it seen with it: one climb, one screen", () => {
    const s = standing(
      [ls(0, "iron", 4), b(1_010, "crusader", 1)],
      [unlock("learn_share", "iron", shown), unlock("builder", "herald", shown), unlock("builder", "guardian"), unlock("builder", "crusader")],
    );
    const r = pickRankUp(s);
    expect(r?.tier).toBe("crusader");
    expect(r?.unlockId).toBe("u-builder-crusader");
    // Guardian was crossed by the same climb: answering marks it too, so it never opens after Crusader.
    expect(r?.markIds.sort()).toEqual(["u-builder-crusader", "u-builder-guardian"]);
    // A tier waiting on the other ladder is another climb and is not marked with this one.
    const two = standing(
      [ls(40, "bronze", 4), b(1_010, "crusader", 1)],
      [unlock("learn_share", "iron", shown), unlock("builder", "herald", shown), unlock("learn_share", "bronze"), unlock("builder", "guardian", { unlocked_at: T1 }), unlock("builder", "crusader", { unlocked_at: T1 })],
    );
    const picked = pickRankUp(two);
    expect(picked?.tier).toBe("crusader");
    expect(picked?.markIds).not.toContain("u-learn_share-bronze");
    expect(picked?.markIds).toHaveLength(2);
  });

  it("names where the reader landed when a big act carries them past the tier's first division", () => {
    const s = standing([ls(290, "silver", 1), b(0, "herald", 1)], [unlock("learn_share", "iron", shown), unlock("learn_share", "bronze", shown), unlock("learn_share", "silver")]);
    expect(pickRankUp(s)?.place).toBe("Learn & Share · Silver I");
  });

  it("between the two ladders, opens the one reached last, Learn & Share first on a tie", () => {
    const both = (lsAt: string, bAt: string) =>
      standing([ls(40, "bronze", 4), b(300, "guardian", 1)], [unlock("learn_share", "bronze", { unlocked_at: lsAt }), unlock("builder", "guardian", { unlocked_at: bAt })]);
    expect(pickRankUp(both(T0, T1))?.ladder).toBe("builder");
    expect(pickRankUp(both(T1, T0))?.ladder).toBe("learn_share");
    expect(pickRankUp(both(T0, T0))?.ladder).toBe("learn_share");
  });

  it("opens nothing for the tier everyone starts on, a shown unlock, a badge, or a division or star", () => {
    // A first act writes Iron and Herald; neither is a climb.
    expect(pickRankUp(standing([ls(10, "iron", 4), b(0, "herald", 1)], [unlock("learn_share", "iron"), unlock("builder", "herald")]))).toBeNull();
    expect(pickRankUp(standing([ls(40, "bronze", 4), b(0, "herald", 1)], [unlock("learn_share", "bronze", shown)]))).toBeNull();
    expect(pickRankUp(standing([ls(40, "bronze", 4), b(0, "herald", 1)], [unlock("learn_share", "bronze", shown), { ...unlock("both", "hunter-1"), kind: "badge" }]))).toBeNull();
    // Gold IV to Gold III moves the bar quietly: no new tier unlock, no rank-up.
    expect(pickRankUp(standing([ls(380, "gold", 3), b(0, "herald", 1)], [unlock("learn_share", "gold", shown)]))).toBeNull();
  });

  it("names the open tops without a division or star, and Immortal's medal by its band", () => {
    const top = standing(
      [ls(10_000, "sovereign", null), b(130_000, "immortal", null, 2)],
      [unlock("learn_share", "sovereign", { unlocked_at: T1 }), unlock("builder", "immortal")],
    );
    expect(pickRankUp(top)).toMatchObject({ tier: "sovereign", place: "Learn & Share · Sovereign" });
    const immortal = standing([ls(0, "iron", 4), b(130_000, "immortal", null, 2)], [unlock("builder", "immortal")]);
    expect(pickRankUp(immortal)).toMatchObject({ tier: "immortal", band: 2, place: "Builder · Immortal" });
  });

  it("says the same moment plainly with the game style off", () => {
    const s = standing([ls(40, "bronze", 4), b(2_500, "archon", 1)], [unlock("learn_share", "bronze", { unlocked_at: T1 }), unlock("builder", "archon")], false);
    expect(pickRankUp(s)).toMatchObject({
      gameOn: false,
      place: "Learn & Share · Bronze, division IV",
      praise: "Every answer, every spark, every session you held added up. Bronze suits you.",
    });
    expect(praiseFor("builder", "Archon", false)).toBe("Real work, shipped and landed. Archon is yours.");
  });

  it("keeps the Avoid list out of every line it can say", () => {
    const avoid = /\b(rank|step|level|xp|leaderboard|frame)\b/i;
    for (const ladder of ["learn_share", "builder"] as const) {
      for (const on of [true, false]) expect(praiseFor(ladder, "Gold", on)).not.toMatch(avoid);
    }
  });
});
