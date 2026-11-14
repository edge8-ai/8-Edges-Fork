import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// TR.4: a training was put on your record. Every organiser write that puts a
// person on a training states it once, for the people it put there and never
// for the organiser; a plan is stated once per person, not per session, and a
// plan closed to learners states nothing until it opens. A training a member
// logs for themselves states nothing at all.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/config/dates", async (orig) => ({ ...(await orig<typeof import("@/kernel/config/dates")>()), saigonToday: () => "2026-10-12" }));
const publish = vi.fn(async (_name: string, _payload: unknown) => {});
vi.mock("@/kernel/events", () => ({ publish: (name: string, payload: unknown) => publish(name, payload) }));
beforeEach(() => resetFake());
afterEach(() => vi.clearAllMocks());

const NOW = new Date("2026-10-12T02:00:00Z");
const ONE_OFF = { typeId: "ty1", title: "Scrim review", date: "2026-10-14", start: "10:00", minutes: 60 };
const PLAN = { id: "p1", type_id: "ty1", title: "English Communication Practice", rhythm: { weekdays: [2, 4], start: "14:00", end: "15:15", tz: "Asia/Ho_Chi_Minh" }, published_until: null, open_to_learners: true, members: [{ person_id: "duc", removed_at: null }, { person_id: "harry", removed_at: null }] };
const stated = () => publish.mock.calls.map(([name, payload]) => ({ name, payload }));

describe("a one-off training", () => {
  it("tells each person the organiser put on it, and not the organiser", async () => {
    const { scheduleTraining } = await import("./trainings");
    script("training_types", { data: [{ id: "ty1" }] });
    script("trainings", { data: { id: "t1" } });
    script("training_attendance", { data: null });
    expect(await scheduleTraining("hoan", { ...ONE_OFF, personIds: ["duc", "hoan", "duc"] }, NOW)).toEqual({ ok: true, id: "t1" });
    expect(stated()).toEqual([
      { name: "training.people.added", payload: { organiserId: "hoan", title: "Scrim review", personIds: ["duc"], on: { kind: "training", trainingId: "t1", startsAt: "2026-10-14T03:00:00.000Z" } } },
    ]);
  });

  it("states nothing when the organiser put only themselves on it, or the people could not be saved", async () => {
    const { scheduleTraining } = await import("./trainings");
    script("training_types", { data: [{ id: "ty1" }] }, { data: [{ id: "ty1" }] });
    // The second training's people fail, so it is withdrawn: the third answer is that cancel.
    script("trainings", { data: { id: "t1" } }, { data: { id: "t2" } }, { data: null });
    script("training_attendance", { data: null }, { error: { message: "down" } });
    expect(await scheduleTraining("hoan", { ...ONE_OFF, personIds: ["hoan"] }, NOW)).toEqual({ ok: true, id: "t1" });
    expect((await scheduleTraining("hoan", { ...ONE_OFF, personIds: ["duc"] }, NOW)).ok).toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });

  it("tells only the people a change of who puts on it: the new and the put back, never those already on it", async () => {
    const { updateTraining } = await import("./trainings");
    const t = { id: "t1", title: "Scrim review", starts_at: "2026-10-14T03:00:00.000Z", cancelled_at: null, plan_id: null, plan_flag: null, attendance: [{ person_id: "duc", removed_at: null }, { person_id: "harry", removed_at: "2026-10-11T00:00:00Z" }] };
    script("trainings", { data: [t] }, { data: null });
    script("training_attendance", { data: null }, { data: null });
    expect(await updateTraining("hoan", "t1", { title: "Scrim review, round two", personIds: ["duc", "harry", "minh"] }, NOW)).toEqual({ ok: true });
    expect(stated()).toEqual([
      { name: "training.people.added", payload: { organiserId: "hoan", title: "Scrim review, round two", personIds: ["harry", "minh"], on: { kind: "training", trainingId: "t1", startsAt: t.starts_at } } },
    ]);
  });

  it("says nothing when a member logs a training for themselves", async () => {
    const { logOwnTraining } = await import("./trainings");
    script("training_types", { data: [{ id: "ty1" }] });
    script("trainings", { data: { id: "t1" } });
    script("training_attendance", { data: null });
    expect(await logOwnTraining("duc", { typeId: "ty1", title: "Conference talk", date: "2026-10-11", start: "09:00", minutes: 60 }, NOW)).toEqual({ ok: true });
    expect(publish).not.toHaveBeenCalled();
  });
});

describe("a plan", () => {
  it("tells its roster once when it is published, however many sessions it makes", async () => {
    const { publishPlan } = await import("./plans");
    script("training_plans", { data: [PLAN] }, { data: null });
    script("trainings", { data: [{ id: "t1" }, { id: "t2" }, { id: "t3" }] });
    script("training_attendance", { data: null });
    expect(await publishPlan("hoan", "p1", "2026-10-20", NOW)).toMatchObject({ ok: true });
    expect(stated()).toEqual([
      { name: "training.people.added", payload: { organiserId: "hoan", title: PLAN.title, personIds: ["duc", "harry"], on: { kind: "plan", planId: "p1" } } },
    ]);
  });

  it("states nothing while the plan is closed to its learners, and tells the roster when it opens", async () => {
    const { publishPlan, setOpenToLearners } = await import("./plans");
    const closed = { ...PLAN, open_to_learners: false };
    script("training_plans", { data: [closed] }, { data: null });
    script("trainings", { data: [{ id: "t1" }] });
    script("training_attendance", { data: null });
    expect(await publishPlan("hoan", "p1", "2026-10-20", NOW)).toMatchObject({ ok: true });
    expect(publish).not.toHaveBeenCalled();

    script("training_plans", { data: [closed] }, { data: null });
    script("trainings", { data: [{ id: "t1" }] });
    expect(await setOpenToLearners("hoan", "p1", true)).toEqual({ ok: true });
    expect(stated()).toEqual([
      { name: "training.people.added", payload: { organiserId: "hoan", title: PLAN.title, personIds: ["duc", "harry"], on: { kind: "plan", planId: "p1" } } },
    ]);
  });

  it("states nothing on closing a plan, or opening one with no session yet", async () => {
    const { setOpenToLearners } = await import("./plans");
    script("training_plans", { data: [PLAN] }, { data: null }, { data: [PLAN] }, { data: null });
    script("trainings", { data: [] });
    expect(await setOpenToLearners("hoan", "p1", false)).toEqual({ ok: true });
    expect(await setOpenToLearners("hoan", "p1", true)).toEqual({ ok: true });
    expect(publish).not.toHaveBeenCalled();
  });

  it("tells a person added to the roster once there are sessions to put them on", async () => {
    const { setRoster } = await import("./plans");
    script("training_plans", { data: [PLAN] }, { data: [PLAN] });
    script("trainings", { data: [{ id: "t1", attendance: [{ person_id: "duc", removed_at: null }, { person_id: "harry", removed_at: null }] }] }, { data: [] });
    script("training_plan_members", { data: null }, { data: null });
    script("training_attendance", { data: null });
    expect(await setRoster("hoan", "p1", ["duc", "harry", "minh"], NOW)).toEqual({ ok: true });
    expect(await setRoster("hoan", "p1", ["duc", "harry", "an"], NOW)).toEqual({ ok: true });
    expect(stated()).toEqual([
      { name: "training.people.added", payload: { organiserId: "hoan", title: PLAN.title, personIds: ["minh"], on: { kind: "plan", planId: "p1" } } },
    ]);
  });

  it("tells the roster as the plan, not the session, when a session is added by hand", async () => {
    const { addSession } = await import("./plans");
    script("training_plans", { data: [PLAN] });
    script("training_types", { data: [{ id: "ty1" }] });
    script("trainings", { data: { id: "t9" } });
    script("training_attendance", { data: null });
    expect(await addSession("hoan", "p1", { date: "2026-10-14", start: "10:00", minutes: 60 }, NOW)).toEqual({ ok: true });
    expect(stated()).toEqual([
      { name: "training.people.added", payload: { organiserId: "hoan", title: PLAN.title, personIds: ["duc", "harry"], on: { kind: "plan", planId: "p1" } } },
    ]);
  });
});
