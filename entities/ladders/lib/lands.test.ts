import { describe, expect, it } from "vitest";
import { ACT_BADGES } from "./act-badges";
import { BADGES } from "./badges";
import { landsFor, MOST_BADGES, type Catalogue } from "./lands";
import type { LearnShareCounts } from "./points";
import type { PositionRow, UnlockRow } from "./rows";
import { shapeStanding } from "./standing";
import { display } from "./testing";

// What each act would land for the reader (QS.15; quests spec "Lands for
// you"): the points, the tier before and after, the next badges it can find
// with the reader's own count, and the Title it lets them wear. The tier
// starts are the ladders spec's (Gold IV 300, III 375, II 450, I 525,
// Platinum 600).

const ME = "person-me";
const NONE: LearnShareCounts = { hits: 0, sparks: 0, fires: 0, beacons: 0 };
const row = (points: number, counts: Partial<LearnShareCounts> = {}): PositionRow => ({
  person_id: ME, ladder: "learn_share", points, tier: "iron", division: 4, stars: null, immortal_band: null, counts: { ...NONE, ...counts }, computed_at: "2026-10-23T00:00:00Z",
});
const badge = (key: string): UnlockRow => ({ id: `u-${key}`, person_id: ME, kind: "badge", ladder: "learn_share", key, unlocked_at: "2026-10-23T00:00:00Z", source: "event", shown_at: "2026-10-23T00:00:00Z" });
const standing = (points: number, counts: Partial<LearnShareCounts> = {}, found: string[] = []) => {
  const s = shapeStanding({ personId: ME }, { positions: [row(points, counts)], unlocks: found.map(badge), display: [display({ person_id: ME })] });
  return { ladder: s.learnShare, found: s.badgesFound };
};
const lands = (points: number, counts: Partial<LearnShareCounts> = {}, found: string[] = [], catalogue?: Catalogue) => {
  const s = standing(points, counts, found);
  return landsFor(s.ladder, s.found, catalogue);
};
const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"];
const SECRET_NAMES = BADGES.filter((b) => b.secret).map((b) => b.name);

describe("landsFor", () => {
  it("reads +100 · Gold III → Gold II for Khoa's fire, Fire keeper II at his own count, and the Title he holds", () => {
    const fire = lands(400, { fires: 1, sparks: 6, hits: 4 }, ["fire-keeper-i", "spark-struck", "first-page", "first-hit"]).fire;
    expect(fire).toMatchObject({
      points: 100,
      after: { tierName: "Gold", division: 2, words: { game: "Gold II", plain: "Gold, division II" } },
      newTier: false,
      left: { points: 25, to: { tierName: "Gold", division: 1, words: { game: "Gold I" } } },
      title: { name: "Fire keeper", held: true },
      tier: "gold",
    });
    expect(fire.badges).toEqual([{ name: "Fire keeper II", rarity: "rare", progress: { have: 1, at: 5 } }]);
  });

  it("says a new tier when the act crosses one, and then no points left", () => {
    const beacon = lands(400).beacon;
    expect(beacon).toMatchObject({ points: 250, after: { tierName: "Platinum", division: 4 }, newTier: true, left: null, tier: "platinum" });
  });

  it("counts what is left from the place the act reaches, within a division", () => {
    // 400 + 10 is still Gold III; Gold II starts at 450.
    expect(lands(400).learning).toMatchObject({ after: { words: { game: "Gold III" } }, newTier: false, left: { points: 40, to: { words: { game: "Gold II" } } } });
  });

  it("offers a one-off the act finds outright as found at 1, and a family's next unfound tier only", () => {
    const beacon = lands(400, { beacons: 4 }, ["keeper-of-the-light-i"]).beacon;
    // The rarity is the catalogue's word for each badge (Lighthouse is rare there, whatever the prototype drew).
    expect(beacon.badges).toEqual([
      { name: "Lighthouse", rarity: "rare", progress: { have: 0, at: 1 } },
      { name: "Keeper of the light II", rarity: "legendary", progress: { have: 4, at: 10 } },
    ]);
  });

  it("shows a family with no count where the standing holds no exact count for it", () => {
    // Lorewright counts learning sparks; the standing counts every spark.
    const learning = lands(400, { sparks: 7 }, ["spark-struck", "first-page"]).learning;
    expect(learning.badges).toEqual([{ name: "Lorewright I", rarity: "common", progress: null }]);
  });

  it("names two badges at most", () => {
    const learning = lands(0).learning;
    expect(MOST_BADGES).toBe(2);
    expect(learning.badges.map((b) => b.name)).toEqual(["Spark struck", "First page of the Lore"]);
    for (const l of Object.values(lands(0))) expect(l.badges.length).toBeLessThanOrEqual(MOST_BADGES);
  });

  it("offers the Title of the badge this one act finds, held once any badge that offers it is found", () => {
    // One fire finds Fire keeper I, so the Title is on offer from the first fire.
    expect(lands(400).fire.title).toEqual({ name: "Fire keeper", held: false });
    expect(lands(400, {}, ["fire-keeper-ii"]).fire.title).toEqual({ name: "Fire keeper", held: true });
    // One Beacon finds Lighthouse, not Keeper of the light (that needs three): the rail promises what the act lands.
    expect(lands(400).beacon.title).toEqual({ name: "Lighthouse", held: false });
    // With Lighthouse found and two Beacons lit, the third finds Keeper of the light I, so that Title is on offer.
    expect(lands(400, { beacons: 2 }, ["lighthouse"]).beacon.title).toEqual({ name: "Keeper of the light", held: false });
  });

  it("falls back to a Title already held when this act finds none, a family's before a one-off's, and to none at all otherwise", () => {
    // Fire keeper I is held and the next tier is four fires away: the held Title, said so.
    expect(lands(400, { fires: 1 }, ["fire-keeper-i"]).fire.title).toEqual({ name: "Fire keeper", held: true });
    // Lorewright has no exact count in the standing, so it is not promised; the held one-off's Title is theirs to wear.
    expect(lands(400, { sparks: 7 }, ["spark-struck", "first-page"]).learning.title).toEqual({ name: "Spark struck", held: true });
    // Once a Lorewright tier is held, the family's Title comes first.
    expect(lands(400, { sparks: 7 }, ["spark-struck", "first-page", "lorewright-i"]).learning.title).toEqual({ name: "Lorewright", held: true });
    // Nothing found and nothing this act finds for certain: no Title line.
    const noCount: Catalogue = { badges: BADGES, acts: { ...ACT_BADGES, learning: { badges: [{ family: "Lorewright", count: null }] } } };
    expect(lands(400, { sparks: 7 }, [], noCount).learning.title).toBeNull();
  });

  it("never names a secret badge, even when the list points at one", () => {
    const pointing: Catalogue = { badges: BADGES, acts: { ...ACT_BADGES, hit: { badges: [{ oneOff: "duel" }, { oneOff: "all-heads-bow" }] } } };
    const hit = lands(400, {}, [], pointing).hit;
    expect(hit.badges).toEqual([]);
    expect(hit.title).toBeNull();
    // And the live list names none, for a new reader or a seasoned one.
    for (const answer of [lands(0), lands(2_000, { hits: 40, fires: 9, beacons: 12, sparks: 50 }, ["first-hit", "hunter-i", "hunter-ii", "spark-struck", "first-page", "lighthouse"])]) {
      const said = JSON.stringify(answer);
      for (const name of SECRET_NAMES) expect(said).not.toContain(name);
    }
  });

  it("words rarity as the catalogue's word, never a share of people", () => {
    for (const l of Object.values(lands(0))) {
      for (const b of l.badges) {
        expect(RARITIES).toContain(b.rarity);
        expect(b.rarity).not.toMatch(/\d|%|held by/);
      }
    }
  });

  it("with the catalogue stubbed out, carries the points and the tier and names no badge and no Title", () => {
    const empty: Catalogue = { badges: [], acts: ACT_BADGES };
    for (const l of Object.values(lands(400, { fires: 1 }, ["fire-keeper-i"], empty))) {
      expect(l.badges).toEqual([]);
      expect(l.title).toBeNull();
    }
    expect(lands(400, {}, [], empty).fire).toMatchObject({ points: 100, after: { words: { game: "Gold II" } }, newTier: false });
  });
});
