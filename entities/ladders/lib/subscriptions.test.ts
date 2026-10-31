import { afterEach, describe, expect, it } from "vitest";
import type { ShippedCardFact } from "@/entities/boards";
import { resetSubscribers, subscribersOf } from "@/kernel/events";
import type { HostedRaid } from "@/entities/quests";
import { beacon, card as shipped, hit, onQuests, onSparks, quest, spark } from "./badge-fixtures";
import { recomputePerson } from "./recompute";
import { ladderHandlers, subscriptions, type SubscriberDeps } from "./subscriptions";
import { memoryDoors, memoryStore, type MemoryActs } from "./testing";

// The ladders' subscribers (LD.2): each fact recomputes the one person it names
// against the in-memory doors and store, exactly as against Supabase. A fact
// delivered twice writes the same rows; a card taken out of Done lowers the
// points and keeps the tier; a register mark on a session that is no Raid's
// recomputes nobody; a fact naming nobody does nothing; a Turn-in climbs the
// person who turned in, never the Giver (A.75); a fire held climbs its Host
// once its session has ended (ADR 0023).

const ME = "person-me";
const HOST = "person-host";
const GIVER = "person-giver";
const NOW = new Date("2026-10-21T19:00:00Z");

const card = (id: string, humanTokens: number | null): ShippedCardFact => shipped({ id, humanTokens });
/** A Raid the Host hosts, as Quests judges it: held only once its session has ended with someone other than the Host attended. */
const raid = (attended: string[], held: boolean): HostedRaid => ({ quest: quest({ kind: "raid", giverId: HOST, hostId: HOST, trainingId: "s1" }), lit: true, held, attended });
const cardFact = (over: Record<string, unknown> = {}) => ({ taskId: "t1", boardSlug: "eight-edges", subjectType: null, subjectId: null, assigneeId: ME, ...over });

function world(acts: MemoryActs, hosts: Record<string, string> = {}) {
  const store = memoryStore();
  const recomputed: string[] = [];
  const deps = (): SubscriberDeps => ({
    async recompute(personId) {
      recomputed.push(personId);
      return recomputePerson(personId, "event", { doors: memoryDoors(acts), store, now: () => NOW });
    },
    async raidHostsOf(ids) {
      return new Map(ids.flatMap((id) => (hosts[id] ? [[id, hosts[id]] as const] : [])));
    },
  });
  return { store, recomputed, h: ladderHandlers(deps), acts };
}

const points = (store: ReturnType<typeof memoryStore>, personId: string, ladder: "learn_share" | "builder") => store.positions.find((p) => p.person_id === personId && p.ladder === ladder)?.points;

afterEach(() => resetSubscribers());

describe("the ladders' subscribers", () => {
  it("registers one handler for each of the six facts", () => {
    resetSubscribers();
    subscriptions();
    for (const name of ["board.card.completed", "board.card.landed", "idea.posted", "training.attendance.marked", "quest.turned_in", "quest.fire.held"] as const) {
      expect(subscribersOf(name)).toEqual(["ladders"]);
    }
  });

  it("board.card.completed: a 1 Human Token leaf card adds 10 Builder points, and a second delivery writes the same rows", async () => {
    const w = world({ cardFacts: { [ME]: [card("t1", 1)] } });
    await w.h.onCardCompleted(cardFact());
    expect(points(w.store, ME, "builder")).toBe(10);
    const once = JSON.stringify([w.store.positions, w.store.unlocks]);
    await w.h.onCardCompleted(cardFact());
    expect(JSON.stringify([w.store.positions, w.store.unlocks])).toBe(once);
    expect(w.recomputed).toEqual([ME, ME]);
  });

  it("board.card.landed out of Done lowers the points and keeps the tier", async () => {
    // Thirty 1 HT cards: 300 points, Guardian. One leaves Done: 290, still Guardian.
    const cards = Array.from({ length: 30 }, (_, i) => card(`t${i}`, 1));
    const acts: MemoryActs = { cardFacts: { [ME]: cards } };
    const w = world(acts);
    await w.h.onCardCompleted(cardFact());
    expect(w.store.positions.find((p) => p.person_id === ME && p.ladder === "builder")).toMatchObject({ points: 300, tier: "guardian" });
    acts.cardFacts![ME] = cards.slice(1);
    await w.h.onCardLanded({ ...cardFact(), status: "open" });
    expect(points(w.store, ME, "builder")).toBe(290);
    expect(w.store.unlocks.filter((u) => u.person_id === ME && u.ladder === "builder").map((u) => u.key)).toEqual(["herald", "guardian"]);
  });

  it("board.card.landed in done is the completion, already recomputed, so it recomputes nobody", async () => {
    const w = world({ cardFacts: { [ME]: [card("t1", 1)] } });
    await w.h.onCardLanded({ ...cardFact(), status: "done" });
    expect(w.recomputed).toEqual([]);
  });

  it("a card fact with no assignee recomputes nobody; the replay credits it", async () => {
    const w = world({});
    await w.h.onCardCompleted(cardFact({ assigneeId: null }));
    await w.h.onCardLanded({ ...cardFact({ assigneeId: null }), status: "not_doing" });
    expect(w.recomputed).toEqual([]);
  });

  it("idea.posted: the author's Learn & Share points rise by 10, and a duplicate changes nothing", async () => {
    const w = world({ sparkFacts: { [ME]: onSparks({ sparks: [spark({ kind: "build" })] }) } });
    await w.h.onIdeaPosted({ ideaId: "i1", personId: ME });
    expect(points(w.store, ME, "learn_share")).toBe(10);
    const once = JSON.stringify([w.store.positions, w.store.unlocks]);
    await w.h.onIdeaPosted({ ideaId: "i1", personId: ME });
    expect(JSON.stringify([w.store.positions, w.store.unlocks])).toBe(once);
  });

  it("training.attendance.marked: recomputes the Raid's Host, never the person marked", async () => {
    // Marked after the session ended, so Quests calls the fire held.
    const acts: MemoryActs = { questFacts: { [HOST]: onQuests({ hosted: [raid([ME], true)] }) } };
    const w = world(acts, { s1: HOST });
    await w.h.onAttendanceMarked({ trainingId: "s1", personId: ME, status: "attended" });
    expect(w.recomputed).toEqual([HOST]);
    expect(points(w.store, HOST, "learn_share")).toBe(100);
    await w.h.onAttendanceMarked({ trainingId: "s1", personId: ME, status: "attended" });
    expect(points(w.store, HOST, "learn_share")).toBe(100);
    // The mark taken back: the fire goes, the tier reached stays.
    acts.questFacts![HOST] = onQuests({ hosted: [raid([], false)] });
    await w.h.onAttendanceMarked({ trainingId: "s1", personId: ME, status: "absent" });
    expect(points(w.store, HOST, "learn_share")).toBe(0);
    expect(w.store.unlocks.filter((u) => u.person_id === HOST && u.ladder === "learn_share").map((u) => u.key)).toEqual(["iron", "bronze"]);
  });

  it("quest.turned_in: a hit adds 10, a Beacon with its link 250, to the person who turned in and never the Giver; a duplicate changes nothing", async () => {
    const acts: MemoryActs = { questFacts: { [ME]: onQuests({ party: [hit({ giverId: GIVER })] }) } };
    const w = world(acts);
    const fact = { questId: "q1", headId: "h1", personId: ME, giverId: GIVER, late: true };
    await w.h.onTurnedIn(fact);
    expect(w.recomputed).toEqual([ME]);
    expect(points(w.store, ME, "learn_share")).toBe(10);
    const once = JSON.stringify([w.store.positions, w.store.unlocks]);
    await w.h.onTurnedIn(fact);
    expect(JSON.stringify([w.store.positions, w.store.unlocks])).toBe(once);
    acts.questFacts![ME].party.push(beacon({ giverId: GIVER }));
    await w.h.onTurnedIn({ ...fact, questId: "q2", late: false });
    expect(points(w.store, ME, "learn_share")).toBe(260);
    expect(points(w.store, GIVER, "learn_share")).toBeUndefined();
  });

  it("training.attendance.marked mid-session recomputes the Host and credits nothing yet: the fire is not held while it burns (ADR 0023)", async () => {
    const w = world({ questFacts: { [HOST]: onQuests({ hosted: [raid([ME], false)] }) } }, { s1: HOST });
    await w.h.onAttendanceMarked({ trainingId: "s1", personId: ME, status: "attended" });
    expect(w.recomputed).toEqual([HOST]);
    expect(points(w.store, HOST, "learn_share")).toBe(0);
  });

  it("quest.fire.held: recomputes the Host once the session has ended, and the clock stating it again changes nothing", async () => {
    const w = world({ questFacts: { [HOST]: onQuests({ hosted: [raid([ME], true)] }) } });
    await w.h.onFireHeld({ questId: "q1", hostId: HOST });
    expect(w.recomputed).toEqual([HOST]);
    expect(points(w.store, HOST, "learn_share")).toBe(100);
    const once = JSON.stringify([w.store.positions, w.store.unlocks]);
    await w.h.onFireHeld({ questId: "q1", hostId: HOST });
    expect(JSON.stringify([w.store.positions, w.store.unlocks])).toBe(once);
  });

  it("training.attendance.marked on a session that is no Raid's recomputes nobody", async () => {
    const w = world({});
    await w.h.onAttendanceMarked({ trainingId: "s9", personId: ME, status: "attended" });
    expect(w.recomputed).toEqual([]);
  });
});
