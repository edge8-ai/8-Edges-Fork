import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// TR.5's plan writes at their seam: only the organiser's own plan is touched,
// publishing creates exactly the rhythm's sessions with the roster on each,
// a second publish starts after the last published date, and a session that
// has started cannot move (through the trainings lib the plan reuses).

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/config/dates", async (orig) => ({ ...(await orig<typeof import("@/kernel/config/dates")>()), saigonToday: () => "2026-10-12" }));

beforeEach(() => resetFake());
afterEach(() => vi.clearAllMocks());

const writes = (table: string, op: string) => calls.filter((c) => c.table === table && c.ops.includes(op));
const NOW = new Date("2026-10-12T02:00:00Z");
const PLAN = { id: "p1", type_id: "ty1", title: "English Communication Practice", rhythm: { weekdays: [2, 4], start: "14:00", end: "15:15", tz: "Asia/Ho_Chi_Minh" }, published_until: null, members: [{ person_id: "duc", removed_at: null }, { person_id: "harry", removed_at: null }] };

describe("publishPlan", () => {
  it("refuses a plan the organiser does not run, before writing anything", async () => {
    const { publishPlan } = await import("./plans");
    script("training_plans", { data: [] });
    expect(await publishPlan("hoan", "p1", "2026-10-31", NOW)).toEqual({ ok: false, error: "That plan was not found." });
    expect(calls[0]?.filters).toContainEqual(["eq", "organiser_id", "hoan"]);
    expect(writes("trainings", "insert")).toEqual([]);
  });

  it("creates one session per rhythm date up to the end date, with the roster on each, then records the date", async () => {
    const { publishPlan } = await import("./plans");
    script("training_plans", { data: [PLAN] }, { data: null });
    script("trainings", { data: [{ id: "t1" }, { id: "t2" }, { id: "t3" }] });
    script("training_attendance", { data: null });
    expect(await publishPlan("hoan", "p1", "2026-10-20", NOW)).toEqual({ ok: true, created: 3 });
    const sessions = writes("trainings", "insert")[0]?.payloads[0] as { starts_at: string; plan_id: string; title: string }[];
    // Tue 13, Thu 15, Tue 20 October at 14:00 Vietnam time.
    expect(sessions.map((s) => s.starts_at)).toEqual(["2026-10-13T07:00:00.000Z", "2026-10-15T07:00:00.000Z", "2026-10-20T07:00:00.000Z"]);
    expect(sessions.every((s) => s.plan_id === "p1" && s.title === PLAN.title)).toBe(true);
    const attendance = writes("training_attendance", "insert")[0]?.payloads[0] as { training_id: string; person_id: string }[];
    expect(attendance).toHaveLength(6);
    expect(attendance.filter((a) => a.training_id === "t2").map((a) => a.person_id)).toEqual(["duc", "harry"]);
    expect(writes("training_plans", "update")[0]?.payloads[0]).toEqual({ published_until: "2026-10-20" });
  });

  it("extends from the day after the last published date, never re-creating a session", async () => {
    const { publishPlan } = await import("./plans");
    script("training_plans", { data: [{ ...PLAN, published_until: "2026-10-15" }] }, { data: null });
    script("trainings", { data: [{ id: "t4" }] });
    script("training_attendance", { data: null });
    expect(await publishPlan("hoan", "p1", "2026-10-21", NOW)).toEqual({ ok: true, created: 1 });
    const sessions = writes("trainings", "insert")[0]?.payloads[0] as { starts_at: string }[];
    expect(sessions.map((s) => s.starts_at)).toEqual(["2026-10-20T07:00:00.000Z"]);
  });

  it("refuses a date at or before the last published one, so a plan is only ever extended", async () => {
    const { publishPlan } = await import("./plans");
    script("training_plans", { data: [{ ...PLAN, published_until: "2026-10-31" }] });
    expect(await publishPlan("hoan", "p1", "2026-10-20", NOW)).toEqual({ ok: false, error: "Already published to 2026-10-31. Pick a later date." });
    expect(writes("trainings", "insert")).toEqual([]);
  });

  it("cancels the sessions it made when their attendance could not be written", async () => {
    const { publishPlan } = await import("./plans");
    script("training_plans", { data: [PLAN] });
    script("trainings", { data: [{ id: "t1" }] }, { data: null });
    script("training_attendance", { error: { message: "boom" } });
    expect(await publishPlan("hoan", "p1", "2026-10-13", NOW)).toEqual({ ok: false, error: "Could not publish the plan. Try again." });
    const cancel = writes("trainings", "update")[0];
    expect(cancel?.payloads[0]).toMatchObject({ cancelled_by: "hoan" });
    expect(cancel?.filters).toContainEqual(["in", "id", ["t1"]]);
    expect(writes("training_plans", "update")).toEqual([]);
  });
});

describe("setRoster", () => {
  it("takes a person off the plan and off every session still to come, and adds a new one to both", async () => {
    const { setRoster } = await import("./plans");
    script("training_plans", { data: [PLAN] });
    script("training_plan_members", { data: null }, { data: null });
    script("trainings", { data: [{ id: "t1", attendance: [{ person_id: "duc", removed_at: null }, { person_id: "harry", removed_at: null }] }] });
    script("training_attendance", { data: null }, { data: null });
    expect(await setRoster("hoan", "p1", ["duc", "linh"], NOW)).toEqual({ ok: true });
    const off = writes("training_plan_members", "update")[0];
    expect(off?.payloads[0]).toMatchObject({ removed_by: "hoan" });
    expect(off?.filters).toContainEqual(["in", "person_id", ["harry"]]);
    expect(writes("training_plan_members", "insert")[0]?.payloads[0]).toEqual([{ plan_id: "p1", person_id: "linh", added_by: "hoan" }]);
    const sessionOff = writes("training_attendance", "update")[0];
    expect(sessionOff?.filters).toContainEqual(["in", "person_id", ["harry"]]);
    expect(writes("training_attendance", "insert")[0]?.payloads[0]).toEqual([{ training_id: "t1", person_id: "linh" }]);
    // Only sessions that have not started follow the roster.
    expect(calls.find((c) => c.table === "trainings")?.filters).toContainEqual(["gt", "starts_at", NOW.toISOString()]);
  });

  // A put-back used to keep the row's old source, so a person the organiser had
  // marked absent came back pending with source organiser, and no transcript
  // would fill their row again (A.40).
  it("puts a person back on the sessions still to come with no word on their row", async () => {
    const { setRoster } = await import("./plans");
    const gone = "2026-10-01T00:00:00Z";
    script("training_plans", { data: [{ ...PLAN, members: [{ person_id: "duc", removed_at: null }, { person_id: "harry", removed_at: gone }] }] });
    script("training_plan_members", { data: null });
    script("trainings", { data: [{ id: "t1", attendance: [{ person_id: "duc", removed_at: null }, { person_id: "harry", removed_at: gone }] }] });
    script("training_attendance", { data: null });
    expect(await setRoster("hoan", "p1", ["duc", "harry"], NOW)).toEqual({ ok: true });
    const back = writes("training_attendance", "update")[0];
    expect(back?.payloads[0]).toEqual({ removed_at: null, removed_by: null, status: "pending", source: "member", skip_reason: null, answered_at: null });
    expect(back?.filters).toContainEqual(["in", "person_id", ["harry"]]);
  });
});

describe("addSession", () => {
  it("puts one more session on the plan with the roster on it", async () => {
    const { addSession } = await import("./plans");
    script("training_plans", { data: [PLAN] });
    script("training_types", { data: [{ id: "ty1" }] });
    script("trainings", { data: { id: "t9" } });
    script("training_attendance", { data: null });
    expect(await addSession("hoan", "p1", { date: "2026-10-14", start: "10:00", minutes: 60 }, NOW)).toEqual({ ok: true });
    expect(writes("trainings", "insert")[0]?.payloads[0]).toMatchObject({ plan_id: "p1", title: PLAN.title, type_id: "ty1", starts_at: "2026-10-14T03:00:00.000Z" });
    expect(writes("training_attendance", "insert")[0]?.payloads[0]).toEqual([
      { training_id: "t9", person_id: "duc" },
      { training_id: "t9", person_id: "harry" },
    ]);
  });

  it("refuses when nobody is on the plan", async () => {
    const { addSession } = await import("./plans");
    script("training_plans", { data: [{ ...PLAN, members: [] }] });
    expect(await addSession("hoan", "p1", { date: "2026-10-14", start: "10:00", minutes: 60 }, NOW)).toEqual({ ok: false, error: "Put someone on the plan first." });
  });
});
