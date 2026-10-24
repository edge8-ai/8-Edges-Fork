import { describe, expect, it } from "vitest";
import type { CardAct } from "@/entities/boards";
import { recomputePerson, type Deps } from "./recompute";
import { replayAll, type ReplayDeps } from "./replay";
import { memoryDoors, memoryStore, type MemoryActs } from "./testing";

// recomputePerson with in-memory doors (LD.1; spec "Testing Decisions"): a
// duplicate event writes the same rows; a card taken out of Done lowers the
// points and keeps the tier; a jump of two tiers unlocks both and waits on the
// higher; the launch source marks everything shown; the replay run twice
// writes the same rows.

const ME = "person-me";
const NOW = new Date("2026-10-21T19:00:00Z");

const card = (humanTokens: number | null, over: Partial<CardAct> = {}): CardAct => ({ id: `c-${Math.random()}`, humanTokens, status: "done", completedAt: "2026-10-20T03:00:00Z", archivedAt: null, liveChildren: 0, ...over });

function deps(acts: MemoryActs, store = memoryStore()): Deps & { store: ReturnType<typeof memoryStore>; doors: ReturnType<typeof memoryDoors> } {
  return { doors: memoryDoors(acts), store, now: () => NOW };
}

describe("recomputePerson", () => {
  it("writes both positions from the acts and unlocks every tier reached, bottom first", async () => {
    // 36 hits (360) and a spark (10): Gold II. Four cards of 10 HT (400): Guardian ★★.
    const d = deps({
      quests: { [ME]: { turnIns: Array.from({ length: 36 }, () => ({ questKind: "bounty", questState: "closed", late: false, turnInUrl: null })), raids: [] } },
      sparks: { [ME]: [{ kind: "learning", archived: false }] },
      cards: { [ME]: [card(10), card(10), card(10), card(10)] },
    });
    const r = await recomputePerson(ME, "event", d);
    expect(r.before).toBeNull();
    expect(r.after.learnShare).toMatchObject({ points: 370, tier: "gold", held: "gold", division: 4, counts: { hits: 36, sparks: 1, fires: 0, beacons: 0 } });
    expect(r.after.builder).toMatchObject({ points: 400, tier: "guardian", held: "guardian", stars: 1, counts: { cards: 4, humanTokens: 40 } });
    expect(r.newTiers).toEqual([
      { ladder: "learn_share", tier: "iron" },
      { ladder: "learn_share", tier: "bronze" },
      { ladder: "learn_share", tier: "silver" },
      { ladder: "learn_share", tier: "gold" },
      { ladder: "builder", tier: "herald" },
      { ladder: "builder", tier: "guardian" },
    ]);
    expect(d.store.positions.map((p) => [p.ladder, p.points, p.tier, p.division, p.stars, p.immortal_band])).toEqual([
      ["learn_share", 370, "gold", 4, null, null],
      ["builder", 400, "guardian", null, 1, null],
    ]);
    // An event leaves the rank-up waiting.
    expect(d.store.unlocks.every((u) => u.source === "event" && u.shown_at === null)).toBe(true);
  });

  it("writes the same rows when the same event is delivered twice", async () => {
    const d = deps({ sparks: { [ME]: [{ kind: "build", archived: false }, { kind: "learning", archived: false }, { kind: "learning", archived: false }, { kind: "learning", archived: false }] } });
    await recomputePerson(ME, "event", d);
    const positions = JSON.stringify(d.store.positions);
    const unlocks = JSON.stringify(d.store.unlocks);
    const again = await recomputePerson(ME, "event", d);
    expect(again.newTiers).toEqual([]);
    expect(JSON.stringify(d.store.positions)).toBe(positions);
    expect(JSON.stringify(d.store.unlocks)).toBe(unlocks);
    expect(d.store.unlocks.map((u) => u.key)).toEqual(["iron", "bronze", "herald"]);
  });

  it("lowers the points and keeps the tier when a card is taken out of Done", async () => {
    const shipped = card(30); // 300 points: Guardian ★
    const d = deps({ cards: { [ME]: [shipped] } });
    const first = await recomputePerson(ME, "event", d);
    expect(first.after.builder).toMatchObject({ points: 300, tier: "guardian", held: "guardian" });
    // The card is reopened: the board's fact now says open.
    d.doors = memoryDoors({ cards: { [ME]: [card(30, { status: "open", completedAt: null })] } });
    const second = await recomputePerson(ME, "event", d);
    expect(second.before?.builder).toMatchObject({ tier: "guardian", held: "guardian" });
    expect(second.after.builder).toMatchObject({ points: 0, tier: "guardian", held: "guardian", stars: 1 });
    expect(second.newTiers).toEqual([]);
    // The stored position says where the points are; the unlock keeps the medal.
    expect(d.store.positions.find((p) => p.ladder === "builder")).toMatchObject({ points: 0, tier: "herald", stars: 1 });
    expect(d.store.unlocks.filter((u) => u.ladder === "builder").map((u) => u.key)).toEqual(["herald", "guardian"]);
  });

  it("unlocks both tiers of a two-tier jump and waits on the higher", async () => {
    const d = deps({ cards: { [ME]: [card(1)] } }); // Herald
    await recomputePerson(ME, "event", d);
    for (const u of d.store.unlocks) u.shown_at = "2026-10-21T10:00:00Z";
    d.doors = memoryDoors({ cards: { [ME]: [card(1), card(100)] } }); // 1,010: Crusader, past Guardian
    const r = await recomputePerson(ME, "event", d);
    expect(r.newTiers).toEqual([
      { ladder: "builder", tier: "guardian" },
      { ladder: "builder", tier: "crusader" },
    ]);
    const waiting = d.store.unlocks.filter((u) => u.shown_at === null).map((u) => u.key);
    expect(waiting).toEqual(["guardian", "crusader"]);
    expect(r.after.builder.held).toBe("crusader");
  });

  it("marks everything it credits as shown when the source is the launch", async () => {
    const d = deps({ sparks: { [ME]: Array.from({ length: 5 }, () => ({ kind: "learning", archived: false })) } });
    await recomputePerson(ME, "launch", d);
    expect(d.store.unlocks.map((u) => [u.key, u.source, u.shown_at])).toEqual([
      ["iron", "launch", NOW.toISOString()],
      ["bronze", "launch", NOW.toISOString()],
      ["herald", "launch", NOW.toISOString()],
    ]);
  });

  it("credits a Raid hosted only when someone other than the Host came, through the session's register", async () => {
    const d = deps({
      quests: { [ME]: { turnIns: [], raids: [{ questId: "q1", trainingId: "t1" }, { questId: "q2", trainingId: "t2" }, { questId: "q3", trainingId: null }] } },
      registers: { t1: { held: true, selfLogged: false, attended: [ME, "guest"] }, t2: { held: true, selfLogged: false, attended: [ME] } },
    });
    const r = await recomputePerson(ME, "event", d);
    expect(r.after.learnShare.counts).toEqual({ hits: 0, sparks: 0, fires: 1, beacons: 0 });
    expect(r.after.learnShare.points).toBe(100);
    expect(d.doors.calls).toMatchObject({ questActsOf: 1, sessionRegisters: 1, sparksOf: 1, shippedCardsOf: 1 });
  });

  it("asks each door once however many people are recomputed", async () => {
    const d = deps({});
    const replay: ReplayDeps = { ...d, teamPeople: async () => ["a", "b", "c"] };
    await replayAll(replay);
    // The badges' questions too (LD.7): once each, and the second questions not at all when nothing names an id.
    expect(d.doors.calls).toEqual({
      questActsOf: 1,
      sessionRegisters: 0,
      sparksOf: 1,
      shippedCardsOf: 1,
      questFactsOf: 1,
      raidHostsOf: 0,
      sparkFactsOf: 1,
      shippedCardFactsOf: 1,
      cardsFromSparks: 0,
      trainingFactsOf: 1,
    });
  });
});

describe("replayAll", () => {
  it("is the launch while nobody has been credited, and a replay from the first unlock on", async () => {
    const d = deps({ sparks: { a: [{ kind: "learning", archived: false }] } });
    const replay: ReplayDeps = { ...d, teamPeople: async () => ["a", "b"] };
    const first = await replayAll(replay);
    expect(first).toMatchObject({ source: "launch", people: 2, unlocked: 4 });
    expect(d.store.unlocks.every((u) => u.shown_at !== null)).toBe(true);
    const second = await replayAll(replay);
    expect(second).toMatchObject({ source: "replay", people: 2, unlocked: 0 });
  });

  it("writes the same rows when run twice", async () => {
    const d = deps({ cards: { a: [card(2.35), card(null)] }, sparks: { b: [{ kind: "build", archived: false }] } });
    const replay: ReplayDeps = { ...d, teamPeople: async () => ["a", "b"] };
    await replayAll(replay);
    const positions = JSON.stringify(d.store.positions);
    const unlocks = JSON.stringify(d.store.unlocks);
    await replayAll(replay);
    expect(JSON.stringify(d.store.positions)).toBe(positions);
    expect(JSON.stringify(d.store.unlocks)).toBe(unlocks);
    expect(d.store.positions.find((p) => p.person_id === "a" && p.ladder === "builder")?.points).toBe(26.5);
  });

  it("recomputes everyone with a row as well as the team of today", async () => {
    const d = deps({});
    const store = d.store;
    await store.writePositions([{ person_id: "left", ladder: "learn_share", points: 0, tier: "iron", division: 4, stars: null, immortal_band: null, counts: { hits: 0, sparks: 0, fires: 0, beacons: 0 }, computed_at: "2026-10-01T00:00:00Z" }]);
    const replay: ReplayDeps = { ...d, teamPeople: async () => ["a"] };
    const r = await replayAll(replay);
    expect(r.people).toBe(2);
    expect(r.results.map((x) => x.personId).sort()).toEqual(["a", "left"]);
  });
});
