import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script, timeline, tick } from "@/kernel/data/testing/fake-company-os";

// Evolve's one move (QS.7): it opens with quests.mine, reads the learning
// again through the Ideas door rather than trusting the page, refuses anyone
// but its author and anything under three will try, and lights the fire
// through the Light it move's own writes: the Training session through its door, then
// the Raid with the learning as its origin. Nothing is sent to anyone at any
// state: the only table it writes is quests.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
let readerId = "kim";
vi.mock("@/kernel/identity/team-auth", () => ({ requireTeamMember: async () => ({ personId: readerId }) }));
const asked: string[] = [];
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async (p: string) => void asked.push(p) }));
const events: { at: number; label: string }[] = [];
// Sessions the live-fire read finds, by training id: what Training's door says of an earlier fire on the learning.
const SESSIONS = new Map<string, { endsAt: string; cancelled: boolean }>();
const training = {
  createTaughtSession: vi.fn(async (..._: unknown[]): Promise<{ ok: true; id: string } | { ok: false; error: string }> => (events.push({ at: tick(), label: "training:create" }), { ok: true as const, id: "t1" })),
  cancelTaughtSession: vi.fn(async (..._: unknown[]) => (events.push({ at: tick(), label: "training:cancel" }), { ok: true as const })),
  taughtSessions: vi.fn(async (ids: readonly string[]) => new Map(ids.flatMap((id) => (SESSIONS.has(id) ? [[id, SESSIONS.get(id)!] as const] : [])))),
  sessionRegisters: vi.fn(async (ids: readonly string[]) => new Map(ids.map((id) => [id, { held: false, selfLogged: false, attended: [] as string[] }]))),
};
vi.mock("@/entities/training", () => training);
type Learning = { id: string; authorId: string; authorName: string; title: string; postedAt: string; willTry: number; youWillTry: boolean };
let learning: Learning | null = null;
const ideas = { learningOf: vi.fn(async (_id: string) => (events.push({ at: tick(), label: "ideas:learning" }), learning)) };
vi.mock("@/entities/ideas", () => ideas);

const { hostFireOnLearning } = await import("./evolve-actions");

const AT = "2026-10-30T16:00:00+07:00";
const mine = (willTry: number): Learning => ({ id: "l1", authorId: "kim", authorName: "Kim", title: "Our proposal template, rebuilt with Claude", postedAt: "2026-10-20T00:00:00Z", willTry, youWillTry: false });
const writes = () => calls.filter((c) => c.ops.some((op) => ["update", "insert", "delete", "upsert"].includes(op)));
const earlierFire = (training: string) => ({ id: "q0", kind: "raid", title: "Our proposal template, rebuilt with Claude", giver_id: "kim", host_id: "kim", training_id: training, origin_idea_id: "l1", created_at: "2026-10-21T00:00:00Z" });

beforeEach(() => {
  resetFake();
  asked.length = 0;
  events.length = 0;
  readerId = "kim";
  learning = null;
  SESSIONS.clear();
  vi.clearAllMocks();
});

describe("hostFireOnLearning", () => {
  it("lights the author's fire at three will try: the session through Training's door, then the Raid with the learning as its origin", async () => {
    learning = mine(3);
    script("quests", { data: [] }, { data: { id: "q1" } });
    expect(await hostFireOnLearning("l1", AT)).toEqual({ ok: true, questId: "q1" });
    expect(asked).toEqual(["quests.mine"]);
    expect(ideas.learningOf).toHaveBeenCalledWith("l1");
    expect(training.createTaughtSession).toHaveBeenCalledWith({ hostPersonId: "kim", title: "Our proposal template, rebuilt with Claude", startsAt: "2026-10-30T09:00:00.000Z", minutes: 20 }, expect.any(Date));
    const [raid] = writes();
    expect(raid?.table).toBe("quests");
    expect(raid?.payloads[0]).toEqual({ kind: "raid", title: "Our proposal template, rebuilt with Claude", ask: "", giver_id: "kim", host_id: "kim", training_id: "t1", origin_idea_id: "l1", learning: false, required: false });
    expect(timeline(events)).toEqual(["ideas:learning", "quests:select", "training:create", "quests:insert"]);
  });

  it("writes nothing but the Raid: no notification, no message, no line to anyone", async () => {
    learning = mine(4);
    script("quests", { data: [] }, { data: { id: "q1" } });
    await hostFireOnLearning("l1", AT);
    expect(writes().map((c) => c.table)).toEqual(["quests"]);
    expect(calls.some((c) => /notif|message|interaction|inbox|email|lark/i.test(c.table))).toBe(false);
  });

  it("refuses a reader who is not the author, from the learning as the database has it, and writes nothing", async () => {
    learning = mine(5);
    readerId = "chi";
    script("quests", { data: [] });
    expect(await hostFireOnLearning("l1", AT)).toEqual({ ok: false, error: "Only its author can evolve a learning. Raise a hand for it instead." });
    expect(training.createTaughtSession).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
  });

  it("refuses under three will try, whatever the page showed", async () => {
    learning = mine(2);
    script("quests", { data: [] });
    expect(await hostFireOnLearning("l1", AT)).toEqual({ ok: false, error: "A learning evolves once 3 people will try it." });
    expect(writes()).toEqual([]);
  });

  it("refuses a second fire while one from the learning is live", async () => {
    learning = mine(3);
    SESSIONS.set("t0", { endsAt: "2026-10-30T09:20:00Z", cancelled: false });
    script("quests", { data: [earlierFire("t0")] });
    expect(await hostFireOnLearning("l1", AT)).toEqual({ ok: false, error: "You lit a fire on this learning already." });
    const [live] = calls.filter((c) => c.table === "quests");
    expect(live?.filters).toEqual([
      ["in", "origin_idea_id", ["l1"]],
      ["in", "kind", ["raid", "beacon"]],
      ["neq", "state", "withdrawn"],
    ]);
    expect(writes()).toEqual([]);
  });

  // QS.7c: the page offers the fire again once the session is cancelled, but a
  // Raid the bus failed to put out is still open, and QS.7b's index would
  // refuse the new one. The action puts the cold Raid out first, so the offer
  // the page makes is one the database accepts.
  it("lights again when the only fire on the learning had its session cancelled, putting out the Raid the cancel left open before it writes the new one", async () => {
    learning = mine(3);
    SESSIONS.set("t0", { endsAt: "2026-10-30T09:20:00Z", cancelled: true });
    script("quests", { data: [earlierFire("t0")] }, { data: null }, { data: { id: "q1" } });
    script("quest_hands", { data: [] });
    expect(await hostFireOnLearning("l1", AT)).toEqual({ ok: true, questId: "q1" });
    const [putOut, lit] = writes();
    expect(putOut?.table).toBe("quests");
    expect(putOut?.payloads[0]).toEqual({ state: "withdrawn", withdrawn_at: expect.any(String) });
    expect(putOut?.filters).toEqual([["eq", "id", "q0"], ["eq", "state", "open"]]);
    expect(lit?.ops).toContain("insert");
    expect(timeline(events)).toEqual(["ideas:learning", "quests:select", "quests:update", "quest_hands:select", "training:create", "quests:insert"]);
  });

  it("lights nothing when the cold Raid cannot be put out, and makes no session", async () => {
    learning = mine(3);
    SESSIONS.set("t0", { endsAt: "2026-10-30T09:20:00Z", cancelled: true });
    script("quests", { data: [earlierFire("t0")] }, { error: { message: "down" } });
    expect(await hostFireOnLearning("l1", AT)).toEqual({ ok: false, error: "Could not save that. Try again." });
    expect(training.createTaughtSession).not.toHaveBeenCalled();
    expect(calls.some((c) => c.table === "quests" && c.ops.includes("insert"))).toBe(false);
  });

  it("puts out no Raid when the fire is refused for another reason", async () => {
    learning = mine(2);
    SESSIONS.set("t0", { endsAt: "2026-10-30T09:20:00Z", cancelled: true });
    script("quests", { data: [earlierFire("t0")] });
    expect(await hostFireOnLearning("l1", AT)).toEqual({ ok: false, error: "A learning evolves once 3 people will try it." });
    expect(writes()).toEqual([]);
  });

  it("refuses a learning that is gone, and a time that has passed", async () => {
    script("quests", { data: [] }, { data: [] });
    expect(await hostFireOnLearning("l1", AT)).toEqual({ ok: false, error: "That learning isn't here any more." });
    learning = mine(3);
    expect(await hostFireOnLearning("l1", "2020-01-01T09:00:00+07:00")).toEqual({ ok: false, error: "Pick a time that has not passed." });
    expect(writes()).toEqual([]);
  });

  it("cancels the session when the Raid cannot be written", async () => {
    learning = mine(3);
    script("quests", { data: [] }, { error: { message: "down" } });
    expect(await hostFireOnLearning("l1", AT)).toEqual({ ok: false, error: "Could not save that. Try again." });
    expect(training.cancelTaughtSession).toHaveBeenCalledWith("kim", "t1", expect.any(Date));
  });

  it("answers the second of two submits on one learning in words, once the database refuses its Raid, and cancels the session it just made", async () => {
    // Both submits counted no live fire; the second insert meets QS.7b's index.
    learning = mine(3);
    script("quests", { data: [] }, {
      error: { code: "23505", message: 'duplicate key value violates unique constraint "quests_one_live_fire_per_learning_idx"' } as { message: string },
    });
    expect(await hostFireOnLearning("l1", AT)).toEqual({ ok: false, error: "You lit a fire on this learning already." });
    expect(writes().map((c) => c.table)).toEqual(["quests"]);
    expect(training.cancelTaughtSession).toHaveBeenCalledExactlyOnceWith("kim", "t1", expect.any(Date));
    expect(timeline(events)).toEqual(["ideas:learning", "quests:select", "training:create", "quests:insert", "training:cancel"]);
  });

  it("keeps the plain failure for any other unique refusal on quests, and still cancels the session", async () => {
    learning = mine(3);
    script("quests", { data: [] }, { error: { code: "23505", message: 'duplicate key value violates unique constraint "quests_pkey"' } as { message: string } });
    expect(await hostFireOnLearning("l1", AT)).toEqual({ ok: false, error: "Could not save that. Try again." });
    expect(training.cancelTaughtSession).toHaveBeenCalledExactlyOnceWith("kim", "t1", expect.any(Date));
  });

  it("writes no Raid when Training refuses the session: the Raid and its session, or neither", async () => {
    learning = mine(3);
    training.createTaughtSession.mockResolvedValueOnce({ ok: false, error: "Could not create the session. Try again." });
    script("quests", { data: [] });
    expect(await hostFireOnLearning("l1", AT)).toEqual({ ok: false, error: "Could not create the session. Try again." });
    expect(writes()).toEqual([]);
    expect(training.cancelTaughtSession).not.toHaveBeenCalled();
  });

  it("says a raise from Training's door is a save that failed, not a read, and writes no Raid", async () => {
    learning = mine(3);
    training.createTaughtSession.mockRejectedValueOnce(new Error("session types down"));
    script("quests", { data: [] });
    expect(await hostFireOnLearning("l1", AT)).toEqual({ ok: false, error: "Could not save that. Try again." });
    expect(writes()).toEqual([]);
  });

  it("turns a failed read into a refusal rather than a page error", async () => {
    ideas.learningOf.mockRejectedValueOnce(new Error("down"));
    script("quests", { data: [] });
    expect(await hostFireOnLearning("l1", AT)).toEqual({ ok: false, error: "Could not read your learning. Try again." });
  });

  it("refuses a missing time before reading anything", async () => {
    expect((await hostFireOnLearning("l1", "")).ok).toBe(false);
    expect(ideas.learningOf).not.toHaveBeenCalled();
  });
});
