import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// TR.8: change notes. Only the plan's own organiser posts or removes one, a
// removed note is hidden and kept, and learners read only plans the page has
// already found open to them.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
beforeEach(() => resetFake());
afterEach(() => vi.clearAllMocks());

const P1 = "22222222-2222-4222-8222-222222222222";
const N1 = "44444444-4444-4444-8444-444444444444";
const writes = (table: string, verb: string) => calls.filter((c) => c.table === table && c.ops[0] === verb);
const filtersOf = (c: { filters: [string, ...unknown[]][] }) => c.filters.map((f) => f.join(":"));

describe("posting a note", () => {
  it("posts on the organiser's own live plan, named as theirs", async () => {
    const { postNote } = await import("./change-notes");
    script("training_plans", { data: [{ id: P1 }] });
    script("training_change_notes", { data: { id: N1 } });
    expect(await postNote("hoan", P1, { body: "Thursdays start with free speaking." })).toEqual({ ok: true, id: N1 });
    expect(writes("training_change_notes", "insert")[0].payloads[0]).toEqual({ plan_id: P1, body: "Thursdays start with free speaking.", posted_by: "hoan" });
    const plan = calls.find((c) => c.table === "training_plans")!;
    expect(filtersOf(plan)).toEqual(expect.arrayContaining([`eq:id:${P1}`, "eq:organiser_id:hoan", "is:archived_at:"]));
  });

  it("refuses a plan someone else runs, or a retired one, and writes nothing", async () => {
    const { postNote } = await import("./change-notes");
    script("training_plans", { data: [] });
    expect(await postNote("dave", P1, { body: "Hi" })).toEqual({ ok: false, error: "That plan is not one you run." });
    expect(writes("training_change_notes", "insert")).toHaveLength(0);
  });
});

describe("removing a note", () => {
  it("hides a shown note on the organiser's own plan and keeps the row", async () => {
    const { removeNote } = await import("./change-notes");
    script("training_plans", { data: [{ id: P1 }] });
    script("training_change_notes", { data: [{ id: N1 }] });
    expect(await removeNote("hoan", P1, N1)).toEqual({ ok: true });
    expect(writes("training_change_notes", "delete")).toHaveLength(0);
    const upd = writes("training_change_notes", "update")[0];
    expect(upd.payloads[0]).toMatchObject({ removed_by: "hoan" });
    expect(filtersOf(upd)).toEqual(expect.arrayContaining([`eq:id:${N1}`, `eq:plan_id:${P1}`, "is:removed_at:"]));
  });

  it("refuses someone who does not run the plan before touching the note", async () => {
    const { removeNote } = await import("./change-notes");
    script("training_plans", { data: [] });
    expect(await removeNote("dave", P1, N1)).toEqual({ ok: false, error: "That plan is not one you run." });
    expect(writes("training_change_notes", "update")).toHaveLength(0);
  });

  it("says so when the note is already gone", async () => {
    const { removeNote } = await import("./change-notes");
    script("training_plans", { data: [{ id: P1 }] });
    script("training_change_notes", { data: [] });
    expect(await removeNote("hoan", P1, N1)).toEqual({ ok: false, error: "That note is already gone." });
  });
});

describe("reading notes", () => {
  it("reads only shown notes of the plans asked for, newest first, by plan", async () => {
    const { notesForPlans } = await import("./change-notes");
    script("training_change_notes", {
      data: [
        { id: "n2", plan_id: P1, body: "Newer", posted_at: "2026-10-30T03:00:00Z", poster: { display_name: null, preferred_name: null, full_name: "Hoan Ngo" } },
        { id: "n1", plan_id: P1, body: "Older", posted_at: "2026-10-20T03:00:00Z", poster: null },
      ],
    });
    const notes = await notesForPlans([P1]);
    expect(notes.get(P1)!.map((n) => n.body)).toEqual(["Newer", "Older"]);
    expect(notes.get(P1)![1]!.postedBy).toBe("The organiser");
    const read = calls.find((c) => c.table === "training_change_notes")!;
    expect(filtersOf(read)).toEqual(expect.arrayContaining(["is:removed_at:"]));
  });

  it("asks nothing when there are no plans", async () => {
    const { notesForPlans } = await import("./change-notes");
    expect((await notesForPlans([])).size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("raises when the read fails, rather than showing a plan whose organiser said nothing", async () => {
    const { notesForPlans } = await import("./change-notes");
    script("training_change_notes", { data: null, error: { message: "boom" } });
    await expect(notesForPlans([P1])).rejects.toThrow();
  });
});

describe("the note's words", () => {
  it("are trimmed, required and at most 600 characters", async () => {
    const { NoteInput } = await import("./change-notes");
    expect(NoteInput.parse({ body: "  Shorter homework  " })).toEqual({ body: "Shorter homework" });
    expect(NoteInput.safeParse({ body: "   " }).success).toBe(false);
    expect(NoteInput.safeParse({ body: "x".repeat(601) }).success).toBe(false);
    expect(NoteInput.safeParse({ body: "x".repeat(600) }).success).toBe(true);
  });
});
