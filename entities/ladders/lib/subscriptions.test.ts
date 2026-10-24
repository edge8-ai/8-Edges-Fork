import { afterEach, describe, expect, it } from "vitest";
import type { CardAct } from "@/entities/boards";
import { resetSubscribers, subscribersOf } from "@/kernel/events";
import { recomputePerson } from "./recompute";
import { ladderHandlers, subscriptions, type SubscriberDeps } from "./subscriptions";
import { memoryDoors, memoryStore, type MemoryActs } from "./testing";

// The ladders' subscribers (LD.2): each fact recomputes the one person it names
// against the in-memory doors and store, exactly as against Supabase. A fact
// delivered twice writes the same rows; a card taken out of Done lowers the
// points and keeps the tier; a register mark on a session that is no Raid's
// recomputes nobody; a fact naming nobody does nothing.

const ME = "person-me";
const HOST = "person-host";
const NOW = new Date("2026-10-21T19:00:00Z");

const card = (id: string, humanTokens: number | null, over: Partial<CardAct> = {}): CardAct => ({ id, humanTokens, status: "done", completedAt: "2026-10-20T03:00:00Z", archivedAt: null, liveChildren: 0, ...over });
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
  it("registers one handler for each of the four facts", () => {
    resetSubscribers();
    subscriptions();
    for (const name of ["board.card.completed", "board.card.landed", "idea.posted", "training.attendance.marked"] as const) {
      expect(subscribersOf(name)).toEqual(["ladders"]);
    }
  });

  it("board.card.completed: a 1 Human Token leaf card adds 10 Builder points, and a second delivery writes the same rows", async () => {
    const w = world({ cards: { [ME]: [card("t1", 1)] } });
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
    const acts: MemoryActs = { cards: { [ME]: cards } };
    const w = world(acts);
    await w.h.onCardCompleted(cardFact());
    expect(w.store.positions.find((p) => p.person_id === ME && p.ladder === "builder")).toMatchObject({ points: 300, tier: "guardian" });
    acts.cards![ME] = cards.slice(1);
    await w.h.onCardLanded({ ...cardFact(), status: "open" });
    expect(points(w.store, ME, "builder")).toBe(290);
    expect(w.store.unlocks.filter((u) => u.person_id === ME && u.ladder === "builder").map((u) => u.key)).toEqual(["herald", "guardian"]);
  });

  it("board.card.landed in done is the completion, already recomputed, so it recomputes nobody", async () => {
    const w = world({ cards: { [ME]: [card("t1", 1)] } });
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
    const w = world({ sparks: { [ME]: [{ kind: "build", archived: false }] } });
    await w.h.onIdeaPosted({ ideaId: "i1", personId: ME });
    expect(points(w.store, ME, "learn_share")).toBe(10);
    const once = JSON.stringify([w.store.positions, w.store.unlocks]);
    await w.h.onIdeaPosted({ ideaId: "i1", personId: ME });
    expect(JSON.stringify([w.store.positions, w.store.unlocks])).toBe(once);
  });

  it("training.attendance.marked: recomputes the Raid's Host, never the person marked", async () => {
    const acts: MemoryActs = {
      quests: { [HOST]: { turnIns: [], raids: [{ questId: "q1", trainingId: "s1" }] } },
      registers: { s1: { held: true, selfLogged: false, attended: [ME] } },
    };
    const w = world(acts, { s1: HOST });
    await w.h.onAttendanceMarked({ trainingId: "s1", personId: ME, status: "attended" });
    expect(w.recomputed).toEqual([HOST]);
    expect(points(w.store, HOST, "learn_share")).toBe(100);
    await w.h.onAttendanceMarked({ trainingId: "s1", personId: ME, status: "attended" });
    expect(points(w.store, HOST, "learn_share")).toBe(100);
    // The mark taken back: the fire goes, the tier reached stays.
    acts.registers!.s1 = { held: true, selfLogged: false, attended: [] };
    await w.h.onAttendanceMarked({ trainingId: "s1", personId: ME, status: "absent" });
    expect(points(w.store, HOST, "learn_share")).toBe(0);
    expect(w.store.unlocks.filter((u) => u.person_id === HOST && u.ladder === "learn_share").map((u) => u.key)).toEqual(["iron", "bronze"]);
  });

  it("training.attendance.marked on a session that is no Raid's recomputes nobody", async () => {
    const w = world({});
    await w.h.onAttendanceMarked({ trainingId: "s9", personId: ME, status: "attended" });
    expect(w.recomputed).toEqual([]);
  });
});
