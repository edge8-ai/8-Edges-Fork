import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// QS.2, the clock's run over the house fake: the decisions are clock-rules'
// (tested as tables beside it), so this checks that the run reads what they
// need and writes only what they decided, each write conditional on what was
// read, and that a fact is stated only by the write that landed.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/events", () => ({ publish: vi.fn(async () => undefined) }));
vi.mock("@/kernel/identity/team-people", () => ({
  listCurrentTeamPeople: vi.fn(async () => ["ana", "bao", "chi"].map((id) => ({ id, name: id }))),
  peopleOnRecord: vi.fn(async () => new Map()),
}));

import { publish } from "@/kernel/events";
import { runQuestClock } from "./quest-clock";

beforeEach(() => resetFake());
afterEach(() => vi.clearAllMocks());

const DUE = "2026-10-28T10:00:00.000Z";
const LATER = "2026-10-28T11:00:00.000Z";
const NOW = new Date("2026-10-28T10:05:00.000Z");
const quest = (over: Record<string, unknown> = {}) => ({
  id: "q1",
  kind: "bounty",
  title: "Share one prompt that saved you an hour",
  ask: "",
  giver_id: "giver",
  state: "open",
  learning: false,
  required: true,
  closing_date: "2026-10-28",
  closed_at: null,
  created_at: "2026-10-27T01:00:00Z",
  ...over,
});
const head = (id: string, closes_at: string, position = 1) => ({ id, quest_id: "q1", position, ask: `Ask of ${id}`, closes_at, closed_at: null });
const row = (id: string, head_id: string, person_id: string, standing: string, reminded_at: string | null = null) => ({
  id,
  quest_id: "q1",
  head_id,
  person_id,
  standing,
  late: false,
  accepted_at: "2026-10-27T01:00:00Z",
  turned_in_at: standing === "turned_in" ? "2026-10-28T03:00:00Z" : null,
  handed_back_at: null,
  missed_at: null,
  turn_in_text: null,
  reminded_at,
});
const updatesOf = (table: string) => calls.filter((c) => c.table === table && c.ops.includes("update"));
const published = () => vi.mocked(publish).mock.calls.map(([name, payload]) => [name, payload]);

describe("the quest clock", () => {
  it("closes a passed head with Missed for those still out, and reminds the next head's people once", async () => {
    script("quests", { data: [quest()] });
    script("quest_heads", { data: [head("h1", DUE), head("h2", LATER, 2)] }, { data: [{ id: "h1" }] });
    script(
      "quest_party",
      { data: [row("r1", "h1", "ana", "accepted"), row("r2", "h1", "bao", "turned_in"), row("r3", "h2", "ana", "accepted"), row("r4", "h2", "bao", "accepted", "2026-10-28T09:00:00Z")] },
      { data: [{ id: "r1" }] },
      { data: [{ person_id: "ana" }] },
    );
    const run = await runQuestClock(NOW);

    const [missed, claim] = updatesOf("quest_party");
    expect(missed.payloads[0]).toEqual({ standing: "missed", missed_at: NOW.toISOString() });
    expect(missed.filters).toEqual([["eq", "id", "r1"], ["eq", "standing", "accepted"]]);
    const [closeHead] = updatesOf("quest_heads");
    expect(closeHead.payloads[0]).toEqual({ closed_at: DUE });
    expect(closeHead.filters).toEqual([["eq", "id", "h1"], ["is", "closed_at", null]]);
    // The second head is still to come, so the quest stays open.
    expect(updatesOf("quests")).toEqual([]);

    expect(claim.payloads[0]).toEqual({ reminded_at: NOW.toISOString() });
    expect(claim.filters).toEqual([["in", "id", ["r3"]], ["is", "reminded_at", null], ["in", "standing", ["called", "accepted"]]]);
    expect(published()).toEqual([["quest.head.due_soon", { questId: "q1", headId: "h2", title: "Share one prompt that saved you an hour", ask: "Ask of h2", closesAt: LATER, personIds: ["ana"] }]]);
    expect(run).toEqual({ closedHeads: 1, missed: 1, closedQuests: 0, reminded: 1, failures: [] });
  });

  it("closes the quest with its last head and states quest.closed once, only when its own write moved it", async () => {
    script("quests", { data: [quest()] }, { data: [{ id: "q1" }] });
    script("quest_heads", { data: [head("h1", DUE)] }, { data: [{ id: "h1" }] });
    script("quest_party", { data: [row("r1", "h1", "ana", "turned_in")] });
    await runQuestClock(NOW);
    const [close] = updatesOf("quests");
    expect(close.payloads[0]).toEqual({ state: "closed", closed_at: NOW.toISOString() });
    expect(close.filters).toEqual([["eq", "id", "q1"], ["eq", "state", "open"]]);
    expect(published()).toEqual([["quest.closed", { questId: "q1", giverId: "giver", by: "clock" }]]);

    // The Giver closed it in between: the write matched nothing, so nothing is stated.
    resetFake();
    vi.mocked(publish).mockClear();
    script("quests", { data: [quest()] }, { data: [] });
    script("quest_heads", { data: [head("h1", DUE)] }, { data: [] });
    script("quest_party", { data: [row("r1", "h1", "ana", "turned_in")] });
    expect((await runQuestClock(NOW)).closedQuests).toBe(0);
    expect(published()).toEqual([]);
  });

  it("names nobody whose row another run claimed first", async () => {
    script("quests", { data: [quest()] });
    script("quest_heads", { data: [head("h1", LATER)] });
    script("quest_party", { data: [row("r1", "h1", "ana", "accepted")] }, { data: [] });
    const run = await runQuestClock(NOW);
    expect(updatesOf("quest_party")).toHaveLength(1);
    expect(published()).toEqual([]);
    expect(run.reminded).toBe(0);
  });

  it("claims only accepted rows on an optional Bounty", async () => {
    script("quests", { data: [quest({ required: false })] });
    script("quest_heads", { data: [head("h1", LATER)] });
    script("quest_party", { data: [row("r1", "h1", "ana", "accepted"), row("r2", "h1", "bao", "called")] }, { data: [{ person_id: "ana" }] });
    await runQuestClock(NOW);
    expect(updatesOf("quest_party")[0].filters).toEqual([["in", "id", ["r1"]], ["is", "reminded_at", null], ["in", "standing", ["accepted"]]]);
  });

  it("reports a failed write as that quest's failure, and still reminds", async () => {
    script("quests", { data: [quest()] });
    script("quest_heads", { data: [head("h1", DUE), head("h2", LATER, 2)] });
    script("quest_party", { data: [row("r1", "h1", "ana", "accepted"), row("r3", "h2", "ana", "accepted")] }, { error: { message: "db down" } }, { data: [{ person_id: "ana" }] });
    const run = await runQuestClock(NOW);
    expect(run.failures).toEqual([{ subject: "quest q1", step: "close", error: "Missed on row r1: db down" }]);
    expect(updatesOf("quest_heads")).toEqual([]);
    expect(run.reminded).toBe(1);
  });

  it("reads every open Bounty, page by page, rather than stopping at a cap", async () => {
    // A full first page means there may be more: the second page is asked for, and its Bounty's head is closed.
    const fullPage = Array.from({ length: 1000 }, (_, i) => quest({ id: `q${i}` }));
    script("quests", { data: fullPage }, { data: [quest({ id: "q1000" })] }, { data: [] });
    script("quest_heads", ...Array.from({ length: 10 }, () => ({ data: [] })), { data: [{ ...head("h1", DUE), quest_id: "q1000" }] }, { data: [{ id: "h1" }] });
    script("quest_party", { data: [] });
    const run = await runQuestClock(NOW);
    const reads = calls.filter((c) => c.table === "quests" && !c.ops.includes("update"));
    expect(reads).toHaveLength(2);
    expect(reads.every((c) => c.ops.includes("range"))).toBe(true);
    expect(run.closedHeads).toBe(1);
  });

  it("reads nothing more when no Bounty is open, and raises a failed read for the routine to record", async () => {
    script("quests", { data: [] });
    expect(await runQuestClock(NOW)).toEqual({ closedHeads: 0, missed: 0, closedQuests: 0, reminded: 0, failures: [] });
    expect(calls.map((c) => c.table)).toEqual(["quests"]);
    script("quests", { error: { message: "db down" } });
    await expect(runQuestClock(NOW)).rejects.toThrow("db down");
  });
});
