import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script, timeline, tick } from "@/kernel/data/testing/fake-company-os";

// Campfires' moves (QS.5): each opens with quests.mine, writes only the
// reader's own hand, lights a fire only at three hands, and reaches Training's
// tables only through its door. Light it writes the session, then the Raid,
// then the hands, and undoes what it wrote when a later step fails.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/kernel/identity/team-auth", () => ({ requireTeamMember: async () => ({ personId: "reader" }) }));
const asked: string[] = [];
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async (p: string) => void asked.push(p) }));
const events: { at: number; label: string }[] = [];
const door = {
  createTaughtSession: vi.fn(async (..._: unknown[]) => (events.push({ at: tick(), label: "training:create" }), { ok: true as const, id: "t1" })),
  cancelTaughtSession: vi.fn(async (..._: unknown[]) => (events.push({ at: tick(), label: "training:cancel" }), { ok: true as const })),
  organisesSession: vi.fn(async (..._: unknown[]) => false),
  takeSeat: vi.fn(async (..._: unknown[]) => ({ ok: true as const })),
  leaveSeat: vi.fn(async (..._: unknown[]) => ({ ok: true as const })),
};
vi.mock("@/entities/training", () => door);

const { raiseHand, lowerHand, lightFire, takeSeat, leaveSeat } = await import("./campfire-actions");

beforeEach(() => {
  resetFake();
  asked.length = 0;
  events.length = 0;
  vi.clearAllMocks();
});

const AT = "2026-10-30T16:00:00+07:00";
const hands = (n: number) => Array.from({ length: n }, (_, i) => ({ person_id: `p${i}`, topic: "prompt evals", topic_key: "prompt evals", created_at: `2026-10-20T0${i}:00:00Z` }));
const writes = (table: string) => calls.filter((c) => c.table === table && c.ops.some((op) => ["update", "insert", "delete"].includes(op)));

describe("raiseHand and lowerHand", () => {
  it("raises the reader's own hand with the words trimmed, under quests.mine", async () => {
    script("quest_hands", { data: null });
    expect(await raiseHand("  Prompt  evals ")).toEqual({ ok: true });
    expect(asked).toEqual(["quests.mine"]);
    expect(writes("quest_hands")[0]?.payloads[0]).toEqual({ person_id: "reader", topic: "Prompt  evals" });
  });

  it("treats a hand already up as done", async () => {
    script("quest_hands", { error: { message: "duplicate", code: "23505" } as { message: string } });
    expect(await raiseHand("prompt evals")).toEqual({ ok: true });
  });

  it("refuses a blank topic and writes nothing", async () => {
    expect((await raiseHand("   ")).ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("lowers only the reader's own wanted hand on that topic", async () => {
    script("quest_hands", { data: null });
    expect(await lowerHand("prompt evals")).toEqual({ ok: true });
    const [del] = writes("quest_hands");
    expect(del?.ops).toContain("delete");
    expect(del?.filters).toEqual([["eq", "person_id", "reader"], ["eq", "topic_key", "prompt evals"], ["is", "quest_id", null]]);
  });
});

describe("lightFire", () => {
  it("is refused below three hands, and nothing is written anywhere", async () => {
    script("quest_hands", { data: hands(2) });
    expect(await lightFire("prompt evals", AT)).toEqual({ ok: false, error: "A fire needs three hands before anyone can light it." });
    expect(door.createTaughtSession).not.toHaveBeenCalled();
    expect(writes("quests")).toEqual([]);
  });

  it("writes the session through the door with the reader as its organiser, then the Raid, then the hands", async () => {
    script("quest_hands", { data: hands(3) }, { data: [{ id: "h1" }, { id: "h2" }, { id: "h3" }] });
    script("quests", { data: { id: "q1" } });
    expect(await lightFire("prompt evals", AT)).toEqual({ ok: true, questId: "q1" });
    expect(asked).toEqual(["quests.mine"]);
    expect(door.createTaughtSession).toHaveBeenCalledWith({ hostPersonId: "reader", title: "prompt evals", startsAt: "2026-10-30T09:00:00.000Z", minutes: 20 }, expect.any(Date));
    expect(writes("quests")[0]?.payloads[0]).toEqual({ kind: "raid", title: "prompt evals", ask: "", giver_id: "reader", host_id: "reader", training_id: "t1", origin_idea_id: null, learning: false, required: false });
    const [lit] = writes("quest_hands");
    expect(lit?.payloads[0]).toEqual({ quest_id: "q1" });
    expect(lit?.filters).toEqual([["eq", "topic_key", "prompt evals"], ["is", "quest_id", null]]);
    expect(timeline(events)).toEqual(["quest_hands:select", "training:create", "quests:insert", "quest_hands:update"]);
  });

  it("cancels the session when the Raid cannot be written", async () => {
    script("quest_hands", { data: hands(3) });
    script("quests", { error: { message: "down" } });
    expect(await lightFire("prompt evals", AT)).toEqual({ ok: false, error: "Could not save that. Try again." });
    expect(door.cancelTaughtSession).toHaveBeenCalledWith("reader", "t1", expect.any(Date));
  });

  it("withdraws its Raid and cancels its session when someone else lit the same fire first", async () => {
    script("quest_hands", { data: hands(3) }, { data: [] });
    script("quests", { data: { id: "q1" } }, { data: null });
    expect(await lightFire("prompt evals", AT)).toEqual({ ok: false, error: "Someone lit this fire a moment ago." });
    const withdraw = writes("quests")[1];
    expect(withdraw?.payloads[0]).toMatchObject({ state: "withdrawn" });
    expect(withdraw?.filters).toEqual([["eq", "id", "q1"]]);
    expect(door.cancelTaughtSession).toHaveBeenCalledWith("reader", "t1", expect.any(Date));
  });

  it("turns a failed read into a refusal rather than a page error", async () => {
    script("quest_hands", { error: { message: "down" } });
    expect(await lightFire("prompt evals", AT)).toEqual({ ok: false, error: "Could not read the campfires. Try again." });
  });
});

describe("takeSeat and leaveSeat", () => {
  const fire = { data: [{ id: "q1", title: "prompt evals", host_id: "chi", training_id: "t1" }] };

  it("puts the reader on the fire's register through the Training door", async () => {
    script("quests", fire);
    expect(await takeSeat("q1")).toEqual({ ok: true });
    expect(asked).toEqual(["quests.mine"]);
    expect(door.organisesSession).toHaveBeenCalledWith("reader", "t1");
    expect(door.takeSeat).toHaveBeenCalledWith("t1", "reader");
    expect(calls.every((c) => !c.table.startsWith("training"))).toBe(true);
  });

  it("refuses the Host, whom Training knows as the session's organiser", async () => {
    script("quests", fire);
    door.organisesSession.mockResolvedValueOnce(true);
    expect(await takeSeat("q1")).toEqual({ ok: false, error: "You host this fire." });
    expect(door.takeSeat).not.toHaveBeenCalled();
  });

  it("leaves the reader's own seat, and refuses a quest that is no lit fire", async () => {
    script("quests", fire, { data: [] });
    expect(await leaveSeat("q1")).toEqual({ ok: true });
    expect(door.leaveSeat).toHaveBeenCalledWith("t1", "reader");
    expect(await leaveSeat("q2")).toEqual({ ok: false, error: "That fire was not found." });
  });
});
