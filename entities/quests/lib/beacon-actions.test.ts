import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script, timeline } from "@/kernel/data/testing/fake-company-os";

// Lighting a Beacon (QS.6; the ladders spec's witness rule): one call, opened
// by quests.mine with the author from the session, writes the Beacon with its
// lit_url, its one head, and the author's own party row turned in with the same
// link, in that order. A failure after the first write withdraws the Beacon. A
// Beacon lit from a held fire records the fire, and its learning, only after
// Training's door says the fire was held.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/kernel/identity/team-auth", () => ({ requireTeamMember: async () => ({ personId: "reader" }) }));
const asked: string[] = [];
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async (p: string) => void asked.push(p) }));
const door = {
  taughtSessions: vi.fn(async (ids: readonly string[]) => new Map(ids.map((id) => [id, { startsAt: "2026-10-20T09:00:00Z", endsAt: "2026-10-20T09:20:00Z", cancelled: false, seated: ["mai"] }]))),
  sessionRegisters: vi.fn(async (ids: readonly string[]) => new Map(ids.map((id) => [id, { held: true, selfLogged: false, attended: ["mai"] }]))),
};
vi.mock("@/entities/training", () => door);

const { lightBeacon } = await import("./beacon-actions");

beforeEach(() => {
  resetFake();
  asked.length = 0;
  vi.clearAllMocks();
});

const LINK = "https://example.com/talk";
const writes = (table: string) => calls.filter((c) => c.table === table && c.ops.some((op) => ["update", "insert"].includes(op)));
const lit = () => {
  script("quests", { data: { id: "b1" } });
  script("quest_heads", { data: { id: "h1" } });
  script("quest_party", { data: null });
};

describe("lightBeacon", () => {
  it("writes the Beacon's lit_url and the author's party row's turn_in_url, both the one link, in one call", async () => {
    lit();
    expect(await lightBeacon({ title: "  Talk at the meetup ", url: ` ${LINK} ` })).toEqual({ ok: true, questId: "b1" });
    expect(asked).toEqual(["quests.mine"]);
    const quest = writes("quests")[0]?.payloads[0] as Record<string, unknown>;
    const party = (writes("quest_party")[0]?.payloads[0] as Record<string, unknown>[])[0];
    expect(quest.lit_url).toBe(LINK);
    expect(party.turn_in_url).toBe(LINK);
    expect(party).toMatchObject({ quest_id: "b1", head_id: "h1", person_id: "reader", standing: "turned_in", late: false });
    expect(quest).toMatchObject({ kind: "beacon", title: "Talk at the meetup", giver_id: "reader", state: "closed", origin_quest_id: null, origin_idea_id: null });
    expect(timeline()).toEqual(["quests:insert", "quest_heads:insert", "quest_party:insert"]);
  });

  it("says what is missing before it writes anything, the link's sentence when only the link is", async () => {
    expect(await lightBeacon({ title: "Talk at the meetup", url: "" })).toEqual({ ok: false, error: "Add the link to the public thing." });
    expect(await lightBeacon({ title: " ", url: LINK })).toEqual({ ok: false, error: "Say what you put out." });
    expect(await lightBeacon({ title: "Talk", url: "javascript:alert(1)" })).toEqual({ ok: false, error: "A link starts with http:// or https://." });
    expect(calls).toEqual([]);
  });

  it("withdraws the Beacon, and is no longer closed, when the party row cannot be written", async () => {
    script("quests", { data: { id: "b1" } }, { data: null });
    script("quest_heads", { data: { id: "h1" } });
    script("quest_party", { error: { message: "down" } });
    expect(await lightBeacon({ title: "Talk", url: LINK })).toEqual({ ok: false, error: "Could not light the Beacon. Try again." });
    const undo = writes("quests")[1];
    expect(undo?.payloads[0]).toMatchObject({ state: "withdrawn", closed_at: null });
    expect(undo?.filters).toEqual([["eq", "id", "b1"]]);
  });

  it("withdraws the Beacon when its head cannot be written, and writes no party row", async () => {
    script("quests", { data: { id: "b1" } }, { data: null });
    script("quest_heads", { error: { message: "down" } });
    expect((await lightBeacon({ title: "Talk", url: LINK })).ok).toBe(false);
    expect(writes("quests")[1]?.payloads[0]).toMatchObject({ state: "withdrawn" });
    expect(writes("quest_party")).toEqual([]);
  });

  it("records a held fire the reader hosted as the origin, with the learning it grew from", async () => {
    script("quests", { data: [{ id: "r1", title: "Our proposal template", origin_idea_id: "idea-1", training_id: "t1" }] }, { data: [] }, { data: { id: "b1" } });
    script("quest_heads", { data: { id: "h1" } });
    script("quest_party", { data: null });
    expect(await lightBeacon({ title: "Our proposal template, the recording", url: LINK, originQuestId: "r1" })).toEqual({ ok: true, questId: "b1" });
    expect(door.taughtSessions).toHaveBeenCalledWith(["t1"]);
    expect(door.sessionRegisters).toHaveBeenCalledWith(["t1"]);
    const [fire] = calls.filter((c) => c.table === "quests");
    expect(fire?.filters).toEqual(expect.arrayContaining([["eq", "id", "r1"], ["eq", "kind", "raid"], ["eq", "host_id", "reader"]]));
    expect(writes("quests")[0]?.payloads[0]).toMatchObject({ origin_quest_id: "r1", origin_idea_id: "idea-1" });
    expect(calls.every((c) => !c.table.startsWith("training"))).toBe(true);
  });

  it("refuses a fire that was not held, and writes nothing", async () => {
    door.sessionRegisters.mockResolvedValueOnce(new Map([["t1", { held: true, selfLogged: false, attended: ["reader"] }]]));
    script("quests", { data: [{ id: "r1", title: "Prompt evals", origin_idea_id: null, training_id: "t1" }] }, { data: [] });
    // Only the Host came, so the fire was not held.
    expect(await lightBeacon({ title: "Prompt evals", url: LINK, originQuestId: "r1" })).toEqual({ ok: false, error: "That fire was not held yet, or it has its Beacon already." });
    expect(writes("quests")).toEqual([]);
  });

  it("refuses a fire that already has its Beacon, or is not the reader's", async () => {
    script("quests", { data: [{ id: "r1", title: "Prompt evals", origin_idea_id: null, training_id: "t1" }] }, { data: [{ origin_quest_id: "r1" }] });
    expect((await lightBeacon({ title: "Prompt evals", url: LINK, originQuestId: "r1" })).ok).toBe(false);
    script("quests", { data: [] });
    expect((await lightBeacon({ title: "Prompt evals", url: LINK, originQuestId: "r9" })).ok).toBe(false);
    expect(writes("quests")).toEqual([]);
  });

  it("answers the second of two submits of one fire in words, once the database refuses its Beacon, and writes nothing more", async () => {
    // Both submits passed the read (no Beacon yet); the second insert meets QS.6b's index.
    script("quests", { data: [{ id: "r1", title: "Our proposal template", origin_idea_id: null, training_id: "t1" }] }, { data: [] }, {
      error: { code: "23505", message: 'duplicate key value violates unique constraint "quests_one_live_beacon_per_fire_idx"' } as { message: string },
    });
    expect(await lightBeacon({ title: "Our proposal template", url: LINK, originQuestId: "r1" })).toEqual({ ok: false, error: "This fire was lit as a Beacon a moment ago." });
    expect(writes("quests")).toHaveLength(1);
    expect(writes("quest_heads")).toEqual([]);
    expect(writes("quest_party")).toEqual([]);
  });

  it("keeps the plain failure for any other unique refusal on quests", async () => {
    script("quests", { error: { code: "23505", message: 'duplicate key value violates unique constraint "quests_pkey"' } as { message: string } });
    expect(await lightBeacon({ title: "Talk", url: LINK })).toEqual({ ok: false, error: "Could not light the Beacon. Try again." });
  });

  it("turns a failed read into a refusal rather than a page error", async () => {
    script("quests", { error: { message: "down" } });
    expect(await lightBeacon({ title: "Prompt evals", url: LINK, originQuestId: "r1" })).toEqual({ ok: false, error: "Could not read your fires. Try again." });
  });
});
