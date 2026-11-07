import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PositionRow, UnlockRow } from "../lib/rows";
import { display, memoryStore, type MemoryStore } from "../lib/testing";

// The learnShareStanding page slot (QS.13), as ladders provides it to Quests'
// next move. It answers for the signed-in reader about the reader and nobody
// else: asked about a teammate it answers nothing, and with a teammate's rows
// in the same tables none of their points reach the answer. Someone without
// ladders.mine gets nothing, and so does a failed read.

const ME = "person-me";
const MATE = "person-mate";

let store: MemoryStore = memoryStore();
let access: { personId: string; may: (p: string, t?: { person?: string }) => boolean } | null = null;
vi.mock("@/kernel/identity/access-request", () => ({ getAccess: async () => access }));
vi.mock("../lib/store", () => ({
  get liveStore() {
    return store;
  },
}));

const { learnShareStanding } = await import("./learn-share-standing");
const { ReadFailure } = await import("@/kernel/data/read");

const ls = (person_id: string, points: number, counts: Partial<PositionRow["counts"]> = {}): PositionRow => ({
  person_id, ladder: "learn_share", points, tier: "iron", division: 4, stars: null, immortal_band: null, counts: { hits: 0, sparks: 0, fires: 0, beacons: 0, ...counts }, computed_at: "2026-10-23T00:00:00Z",
});
const found = (person_id: string, key: string): UnlockRow => ({ id: `u-${person_id}-${key}`, person_id, kind: "badge", ladder: "learn_share", key, unlocked_at: "2026-10-23T00:00:00Z", source: "event", shown_at: "2026-10-23T00:00:00Z" });
const may = (who: string) => (p: string, t?: { person?: string }) => p === "ladders.mine" && (!t?.person || t.person === who);

beforeEach(() => {
  // The reader has hosted one fire and found Fire keeper I; the teammate has
  // lit 31 Beacons and holds every Keeper of the light tier but the last.
  store = memoryStore({
    positions: [ls(ME, 400, { fires: 1 }), ls(MATE, 7_777, { beacons: 31 })],
    unlocks: [found(ME, "fire-keeper-i"), found(MATE, "lighthouse"), found(MATE, "keeper-of-the-light-i"), found(MATE, "keeper-of-the-light-ii")],
    display: [display({ person_id: ME }), display({ person_id: MATE })],
  });
  access = { personId: ME, may: may(ME) };
});
const withoutHelms = (s: Awaited<ReturnType<typeof learnShareStanding>>) =>
  s && { ...s, helm: null, lands: Object.fromEntries(Object.entries(s.lands).map(([act, l]) => [act, { ...l, helm: null }])) };

describe("learnShareStanding", () => {
  it("answers the reader's own place, the points each act earns and where each would take them", async () => {
    const s = await learnShareStanding({ personId: ME });
    expect(s).toMatchObject({ tierName: "Gold", division: 3, points: 400, divisionStart: 375, words: { game: "Gold III" }, next: { start: 450, tierName: "Gold", division: 2 } });
    expect(s?.pointsFor).toEqual({ hit: 10, learning: 10, fire: 100, beacon: 250 });
    expect(s?.reaches.fire).toMatchObject({ tierName: "Gold", division: 2, newTier: false, words: { game: "Gold II" } });
    expect(s?.reaches.beacon).toMatchObject({ tierName: "Platinum", division: 4, newTier: true });
    // The helm is the emblem module's, named for the tier.
    expect(renderToStaticMarkup(<>{s?.helm}</>)).toContain('aria-label="Gold"');
  });

  it("answers what each act would land for the reader from the same read, with the reached tier's helm (QS.15)", async () => {
    const s = await learnShareStanding({ personId: ME });
    expect(s?.lands.fire).toMatchObject({
      points: 100,
      after: { words: { game: "Gold II" } },
      newTier: false,
      left: { points: 25, to: { words: { game: "Gold I" } } },
      badges: [{ name: "Fire keeper II", rarity: "rare", progress: { have: 1, at: 5 } }],
      title: { name: "Fire keeper", held: true },
    });
    expect(s?.lands.fire).not.toHaveProperty("tier");
    expect(renderToStaticMarkup(<>{s?.lands.beacon.helm}</>)).toContain('aria-label="Platinum"');
  });

  it("carries nothing of a teammate's standing", async () => {
    const s = await learnShareStanding({ personId: ME });
    const said = JSON.stringify(withoutHelms(s));
    expect(said).not.toMatch(/7777|7,777|Challenger|"have":31|Keeper of the light III/);
    // The reader's own Beacon count, and the first Keeper of the light tier they have not found.
    expect(s?.lands.beacon.badges).toEqual([
      { name: "Lighthouse", rarity: "rare", progress: { have: 0, at: 1 } },
      { name: "Keeper of the light I", rarity: "epic", progress: { have: 0, at: 3 } },
    ]);
    // One Beacon finds Lighthouse; Keeper of the light is three away and is not promised.
    expect(s?.lands.beacon.title).toEqual({ name: "Lighthouse", held: false });
  });

  it("answers nothing when asked about anyone but the signed-in reader", async () => {
    expect(await learnShareStanding({ personId: MATE })).toBeNull();
  });

  it("answers nothing without ladders.mine, or with nobody signed in", async () => {
    access = { personId: ME, may: () => false };
    expect(await learnShareStanding({ personId: ME })).toBeNull();
    access = null;
    expect(await learnShareStanding({ personId: ME })).toBeNull();
  });

  it("answers nothing when the standing cannot be read, and says so in the log", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    store = { ...store, positionsOf: async () => { throw new ReadFailure("[ladders] positions", "down"); } };
    expect(await learnShareStanding({ personId: ME })).toBeNull();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
