import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The door Quests' Campfires reaches Training through (QS.5): a session created
// for the person who teaches it, with them as its organiser; a seat put on and
// taken off the register by the person themselves; and the per-session
// organiser check that lets a Raid's Host run their one session without the
// global training.organise atom.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
beforeEach(() => resetFake());
afterEach(() => vi.clearAllMocks());

const NOW = new Date("2026-10-23T03:00:00Z");
const THURSDAY_1600_SAIGON = "2026-10-30T09:00:00.000Z";
const TYPES = { data: [{ id: "ty-sharing", name: "Sharing session", sort_order: 40, archived_at: null }, { id: "ty-class", name: "Class", sort_order: 10, archived_at: null }] };
const writes = (table: string) => calls.filter((c) => c.table === table && c.ops.some((op) => ["update", "insert", "upsert", "delete"].includes(op)));

describe("createTaughtSession", () => {
  it("files a Sharing session organised by the host, twenty minutes long, with nobody on its register", async () => {
    const { createTaughtSession } = await import("./taught-sessions");
    script("training_types", TYPES);
    script("trainings", { data: { id: "t1" } });
    expect(await createTaughtSession({ hostPersonId: "chi", title: " prompt evals ", startsAt: THURSDAY_1600_SAIGON, minutes: 20 }, NOW)).toEqual({ ok: true, id: "t1" });
    const [insert] = writes("trainings");
    expect(insert?.payloads[0]).toEqual({ type_id: "ty-sharing", title: "prompt evals", starts_at: THURSDAY_1600_SAIGON, ends_at: "2026-10-30T09:20:00.000Z", organiser_id: "chi", self_logged: false });
    expect(writes("training_attendance")).toEqual([]);
  });

  it("refuses a time that has passed, an odd length or a missing title, and writes nothing", async () => {
    const { createTaughtSession } = await import("./taught-sessions");
    expect(await createTaughtSession({ hostPersonId: "chi", title: "evals", startsAt: "2026-10-22T09:00:00Z", minutes: 20 }, NOW)).toEqual({ ok: false, error: "Pick a time that has not passed." });
    expect(await createTaughtSession({ hostPersonId: "chi", title: "evals", startsAt: THURSDAY_1600_SAIGON, minutes: 0 }, NOW)).toEqual({ ok: false, error: "A session lasts between five minutes and a day." });
    expect(await createTaughtSession({ hostPersonId: "chi", title: "  ", startsAt: THURSDAY_1600_SAIGON, minutes: 20 }, NOW)).toEqual({ ok: false, error: "Give the session a title." });
    expect(calls).toEqual([]);
  });

  it("says so when the Sharing session type has been retired, rather than filing it under another", async () => {
    const { createTaughtSession } = await import("./taught-sessions");
    script("training_types", { data: [{ id: "ty-class", name: "Class", sort_order: 10, archived_at: null }] });
    const r = await createTaughtSession({ hostPersonId: "chi", title: "evals", startsAt: THURSDAY_1600_SAIGON, minutes: 20 }, NOW);
    expect(r.ok).toBe(false);
    expect(writes("trainings")).toEqual([]);
  });
});

describe("organisesSession, the per-session organiser check", () => {
  it("asks the one session for this person as its organiser, never the global atom", async () => {
    const { organisesSession } = await import("./taught-sessions");
    script("trainings", { data: [{ id: "t1" }] });
    expect(await organisesSession("chi", "t1")).toBe(true);
    expect(calls[0]?.filters).toEqual(expect.arrayContaining([["eq", "id", "t1"], ["eq", "organiser_id", "chi"], ["eq", "self_logged", false]]));
  });

  it("answers no for anyone else, and raises on a failed read rather than answering", async () => {
    const { organisesSession } = await import("./taught-sessions");
    script("trainings", { data: [] }, { error: { message: "down" } });
    expect(await organisesSession("duc", "t1")).toBe(false);
    await expect(organisesSession("duc", "t1")).rejects.toThrow();
  });
});

const session = (over: Record<string, unknown> = {}) => ({ id: "t1", ends_at: "2026-10-30T09:20:00Z", cancelled_at: null, self_logged: false, attendance: [], ...over });

describe("takeSeat", () => {
  it("puts the person's own row on the register, pending", async () => {
    const { takeSeat } = await import("./taught-sessions");
    script("trainings", { data: [session()] });
    script("training_attendance", { data: null });
    expect(await takeSeat("t1", "duc", NOW)).toEqual({ ok: true });
    expect(writes("training_attendance")[0]?.payloads[0]).toEqual({ training_id: "t1", person_id: "duc" });
  });

  it("is a no-op for someone already seated, and a double click's duplicate is too", async () => {
    const { takeSeat } = await import("./taught-sessions");
    script("trainings", { data: [session({ attendance: [{ id: "a1", person_id: "duc", removed_at: null }] })] });
    expect(await takeSeat("t1", "duc", NOW)).toEqual({ ok: true });
    expect(writes("training_attendance")).toEqual([]);
    script("trainings", { data: [session()] });
    script("training_attendance", { error: { message: "duplicate", code: "23505" } as { message: string } });
    expect(await takeSeat("t1", "duc", NOW)).toEqual({ ok: true });
  });

  it("puts back a seat the person left themselves, with no word", async () => {
    const { takeSeat } = await import("./taught-sessions");
    script("trainings", { data: [session({ attendance: [{ id: "a1", person_id: "duc", removed_at: "2026-10-22T00:00:00Z", removed_by: "duc" }] })] });
    script("training_attendance", { data: null });
    expect(await takeSeat("t1", "duc", NOW)).toEqual({ ok: true });
    const [update] = writes("training_attendance");
    expect(update?.payloads[0]).toEqual({ removed_at: null, removed_by: null, status: "pending", source: "member", skip_reason: null, answered_at: null });
    expect(update?.filters).toEqual(expect.arrayContaining([["eq", "id", "a1"], ["eq", "person_id", "duc"]]));
  });

  it("keeps off a person the organiser took off: only the organiser undoes that, and nothing is written", async () => {
    const { takeSeat } = await import("./taught-sessions");
    script("trainings", { data: [session({ attendance: [{ id: "a1", person_id: "duc", removed_at: "2026-10-22T00:00:00Z", removed_by: "organiser" }] })] });
    expect(await takeSeat("t1", "duc", NOW)).toEqual({ ok: false, error: "The organiser took you off this session." });
    expect(writes("training_attendance")).toEqual([]);
  });

  it("refuses an ended, cancelled, self-logged or unknown session and writes nothing", async () => {
    const { takeSeat } = await import("./taught-sessions");
    script("trainings", { data: [session({ ends_at: "2026-10-23T02:00:00Z" })] }, { data: [session({ cancelled_at: "2026-10-22T00:00:00Z" })] }, { data: [session({ self_logged: true })] }, { data: [] });
    expect(await takeSeat("t1", "duc", NOW)).toEqual({ ok: false, error: "That session has ended." });
    expect(await takeSeat("t1", "duc", NOW)).toEqual({ ok: false, error: "That session was cancelled." });
    expect(await takeSeat("t1", "duc", NOW)).toEqual({ ok: false, error: "That session was not found." });
    expect(await takeSeat("t1", "duc", NOW)).toEqual({ ok: false, error: "That session was not found." });
    expect(writes("training_attendance")).toEqual([]);
  });
});

describe("leaveSeat", () => {
  it("marks only the person's own pending row removed, by them, and deletes nothing: the register's rule", async () => {
    const { leaveSeat } = await import("./taught-sessions");
    script("training_attendance", { data: null });
    expect(await leaveSeat("t1", "duc", NOW)).toEqual({ ok: true });
    const [left] = calls;
    expect(left?.ops).toContain("update");
    expect(left?.ops).not.toContain("delete");
    expect(left?.payloads[0]).toEqual({ removed_at: NOW.toISOString(), removed_by: "duc" });
    expect(left?.filters).toEqual([["eq", "training_id", "t1"], ["eq", "person_id", "duc"], ["eq", "status", "pending"], ["is", "removed_at", null]]);
  });

  it("says so when the update fails", async () => {
    const { leaveSeat } = await import("./taught-sessions");
    script("training_attendance", { error: { message: "down" } });
    expect(await leaveSeat("t1", "duc")).toEqual({ ok: false, error: "Could not leave your seat. Try again." });
  });
});

describe("taughtSessions", () => {
  it("returns each session's time and its seats in the order they were taken: a removal drops a seat, a person's word on going never does (ADR 0016)", async () => {
    const { taughtSessions } = await import("./taught-sessions");
    script("trainings", {
      data: [
        {
          id: "t1",
          starts_at: "2026-10-30T09:00:00Z",
          ends_at: "2026-10-30T09:20:00Z",
          cancelled_at: null,
          attendance: [
            { person_id: "b", status: "pending", removed_at: null, created_at: "2026-10-23T02:00:00Z" },
            { person_id: "a", status: "pending", removed_at: null, created_at: "2026-10-23T01:00:00Z" },
            { person_id: "c", status: "pending", removed_at: "2026-10-23T02:30:00Z", created_at: "2026-10-23T00:00:00Z" },
            { person_id: "d", status: "skipped", removed_at: null, created_at: "2026-10-23T00:00:00Z" },
          ],
        },
      ],
    });
    const map = await taughtSessions(["t1", "unknown"]);
    expect(map.get("t1")).toEqual({ startsAt: "2026-10-30T09:00:00Z", endsAt: "2026-10-30T09:20:00Z", cancelled: false, seated: ["d", "a", "b"] });
    expect(map.has("unknown")).toBe(false);
  });
});
