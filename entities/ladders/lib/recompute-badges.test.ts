import { describe, expect, it } from "vitest";
import type { CardAct } from "@/entities/boards";
import type { TurnInAct } from "@/entities/quests";
import { MATE, ME, card, hit, spark, times } from "./badge-fixtures";
import { recomputePerson, type Deps } from "./recompute";
import { replayAll, type ReplayDeps } from "./replay";
import type { UnlockRow } from "./rows";
import { myStanding } from "./standing";
import { display, memoryDoors, memoryStore, type MemoryActs, type StoredUnlock } from "./testing";
import { wornTiers } from "./worn";

// Badges in the recompute (LD.7; spec "How positions are written", "Badges as
// data"): a member's history is credited quietly at the badges' launch, each
// badge with its witness; a replay never writes a badge twice; an event before
// the launch writes none, and one after it leaves the badge waiting to be
// shown; and a teammate's wornTiers answer is the same bytes before and after.

const NOW = new Date("2026-10-23T19:00:00Z");

const turnIn = (): TurnInAct => ({ questKind: "bounty", questState: "closed", late: false, turnInUrl: null });
const shippedAct = (id: string): CardAct => ({ id, humanTokens: 1, status: "done", completedAt: "2026-10-01T03:00:00Z", archivedAt: null, liveChildren: 0 });

/** A seeded member with history: three Turn-ins, a spark and ten leaf cards, as both the points' doors and the badges' doors tell it. */
function seeded(): MemoryActs {
  const hits = times(3, () => hit());
  const sparks = [spark({ kind: "build" })];
  const cards = times(10, () => card());
  return {
    quests: { [ME]: { turnIns: hits.map(turnIn), raids: [] } },
    sparks: { [ME]: sparks.map((s) => ({ kind: s.kind, archived: s.archived })) },
    cards: { [ME]: cards.map((c) => shippedAct(c.id)) },
    questFacts: { [ME]: { party: hits, given: [], hosted: [], reactionsGiven: [], reactionsReceived: [] } },
    sparkFacts: { [ME]: { sparks, marksGiven: [], buildNotes: [], heldReceived: [] } },
    cardFacts: { [ME]: cards },
  };
}

function deps(acts: MemoryActs, store = memoryStore()) {
  const d: Deps & { store: ReturnType<typeof memoryStore>; doors: ReturnType<typeof memoryDoors> } = { doors: memoryDoors(acts), store, now: () => NOW };
  const replay: ReplayDeps = { ...d, teamPeople: async () => [ME, MATE] };
  return { d, replay };
}

const badges = (unlocks: StoredUnlock[]) => unlocks.filter((u) => u.kind === "badge");

describe("badges in the recompute", () => {
  it("credits a member's history quietly at the launch: Hunter I, Spark struck and Anvil I, each with its witness, all shown", async () => {
    const acts = seeded();
    const { d, replay } = deps(acts);
    const r = await replayAll(replay);
    expect(r).toMatchObject({ source: "launch", badgeSource: "launch" });
    const found = badges(d.store.unlocks);
    expect(found.map((u) => u.key)).toEqual(expect.arrayContaining(["hunter-i", "spark-struck", "anvil-i", "first-hit", "first-strike", "weighed", "both-hands"]));
    expect(found.every((u) => u.person_id === ME && u.source === "launch" && u.shown_at === NOW.toISOString())).toBe(true);
    const hunter = found.find((u) => u.key === "hunter-i");
    expect(hunter).toMatchObject({ ladder: "learn_share", witness_table: "quest_party", witness_id: acts.questFacts?.[ME].party[2].id });
    expect(found.find((u) => u.key === "anvil-i")).toMatchObject({ ladder: "builder", witness_table: "tasks", witness_id: acts.cardFacts?.[ME][9].id });
    expect(found.find((u) => u.key === "both-hands")?.ladder).toBe("both");
    expect(r.badges).toBe(found.length);
  });

  it("writes the same rows when the replay finds the same badges again", async () => {
    const { d, replay } = deps(seeded());
    await replayAll(replay);
    const unlocks = JSON.stringify(d.store.unlocks);
    const again = await replayAll(replay);
    expect(again).toMatchObject({ source: "replay", badgeSource: "replay", badges: 0 });
    expect(JSON.stringify(d.store.unlocks)).toBe(unlocks);
  });

  it("launches the badges on their own when the ladders launched before them, still quietly", async () => {
    // Tiers were credited long ago; no badge has ever been written.
    const store = memoryStore({ unlocks: [{ id: "u0", person_id: ME, kind: "tier", ladder: "learn_share", key: "iron", unlocked_at: "2026-10-21T19:00:00Z", source: "launch", shown_at: "2026-10-21T19:00:00Z" } satisfies UnlockRow] });
    const { d, replay } = deps(seeded(), store);
    const r = await replayAll(replay);
    expect(r).toMatchObject({ source: "replay", badgeSource: "launch" });
    expect(badges(d.store.unlocks).every((u) => u.source === "launch" && u.shown_at !== null)).toBe(true);
    // A tier the same run finds is a replay's, and waits to be shown.
    expect(d.store.unlocks.filter((u) => u.kind === "tier" && u.key === "bronze").map((u) => u.shown_at)).toEqual([null]);
  });

  it("writes no badge from an event before the launch, so history cannot be announced piecemeal", async () => {
    const { d } = deps(seeded());
    const r = await recomputePerson(ME, "event", d);
    expect(r.newBadges).toEqual([]);
    expect(badges(d.store.unlocks)).toEqual([]);
    expect(d.doors.calls.questFactsOf).toBe(0);
  });

  it("leaves a badge an event finds after the launch waiting to be shown", async () => {
    const acts = seeded();
    const { d, replay } = deps(acts);
    await replayAll(replay);
    // The member posts a third learning spark: Lorewright I.
    const learning = times(3, () => spark());
    acts.sparkFacts = { [ME]: { sparks: [...(acts.sparkFacts?.[ME].sparks ?? []), ...learning], marksGiven: [], buildNotes: [], heldReceived: [] } };
    acts.sparks = { [ME]: [...(acts.sparks?.[ME] ?? []), ...learning.map((s) => ({ kind: s.kind, archived: false }))] };
    d.doors = memoryDoors(acts);
    const r = await recomputePerson(ME, "event", d);
    expect(r.newBadges.map((b) => b.badge)).toEqual(["lorewright-i", "first-page"]);
    expect(badges(d.store.unlocks).filter((u) => u.shown_at === null).map((u) => [u.key, u.source, u.witness_table])).toEqual([
      ["lorewright-i", "event", "ideas"],
      ["first-page", "event", "ideas"],
    ]);
    // The reader sees what they found; the new ones are not yet shown.
    const mine = await myStanding({ personId: ME }, d.store);
    expect(mine.badgesFound.find((b) => b.key === "lorewright-i")).toMatchObject({ name: "Lorewright I", shown: false });
    expect(mine.badgesFound.find((b) => b.key === "hunter-i")).toMatchObject({ name: "Hunter I", shown: true });
  });

  it("finds Twin crowns from the tiers held after the points, never lowered", async () => {
    // 300 Learn & Share points (Gold) from thirty hits, and 2,500 Builder points (Archon) from one card of 250.
    const hits = times(30, () => hit());
    const big = card({ humanTokens: 250 });
    const acts: MemoryActs = {
      quests: { [ME]: { turnIns: hits.map(turnIn), raids: [] } },
      cards: { [ME]: [{ ...shippedAct(big.id), humanTokens: 250 }] },
      questFacts: { [ME]: { party: hits, given: [], hosted: [], reactionsGiven: [], reactionsReceived: [] } },
      cardFacts: { [ME]: [big] },
    };
    const { d, replay } = deps(acts);
    await replayAll(replay);
    expect(d.store.unlocks.find((u) => u.key === "twin-crowns-i")).toMatchObject({ ladder: "both", witness_table: null, witness_id: null });
  });

  it("leaves a teammate's wornTiers answer byte for byte the same when badges are written", async () => {
    const acts = seeded();
    acts.questFacts = { ...acts.questFacts, [MATE]: { party: times(3, () => hit()), given: [], hosted: [], reactionsGiven: [], reactionsReceived: [] } };
    const store = memoryStore({ display: [display({ person_id: MATE, wear_learn_share: true, wear_builder: true, shown_stats: ["hits", "cards"], display_case: [] })] });
    const { d, replay } = deps(acts, store);
    // Tiers first, with the badges held back, so only the badges differ between the two answers.
    for (const id of [ME, MATE]) await recomputePerson(id, "replay", d, { badges: "skip" });
    const before = JSON.stringify([...(await wornTiers([MATE, ME], { store })).entries()]);
    const profileBefore = JSON.stringify(await wornTiers([MATE], { profile: true, store }));
    await replayAll(replay);
    expect(badges(d.store.unlocks).some((u) => u.person_id === MATE)).toBe(true);
    expect(JSON.stringify([...(await wornTiers([MATE, ME], { store })).entries()])).toBe(before);
    expect(JSON.stringify(await wornTiers([MATE], { profile: true, store }))).toBe(profileBefore);
  });
});
