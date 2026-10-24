import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// TR.2's organiser actions at their seam: an organiser changes only what they
// organised, within their reach, and not the time or the people once it has
// started. The lib runs for real over the fake client.

const may = vi.fn((_permission: string, _target?: { person?: string }) => true);
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: vi.fn(async () => ({ may, user: { id: "u1", email: "me@example.test" }, personId: "me", impersonation: null })),
}));
vi.mock("@/kernel/identity/team-auth", () => ({ requireTeamMember: vi.fn(async () => ({ personId: "me", teamMemberId: "tm1" })) }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(() => resetFake());
afterEach(() => vi.clearAllMocks());

const writes = (table: string, op: string) => calls.filter((c) => c.table === table && c.ops.includes(op));
const ID = "6f1c6a9e-2b8f-4a3e-9d6e-1a2b3c4d5e6f";
const PAST = "2026-01-01T09:00:00Z";
const FUTURE = "2099-01-01T09:00:00Z";

describe("organising", () => {
  const schedule = { typeId: ID, title: "Workshop: evals", date: "2099-01-01", start: "14:00", minutes: 120 };

  it("refuses a person outside the organiser's reach, before writing anything", async () => {
    may.mockImplementation((_p, target) => target?.person !== "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f");
    const { scheduleTrainingAction } = await import("./actions");
    expect(await scheduleTrainingAction({ ...schedule, personIds: ["1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f"] })).toEqual({
      ok: false,
      error: "You can schedule trainings only for your own team.",
    });
    expect(writes("trainings", "insert")).toEqual([]);
    may.mockImplementation(() => true);
  });

  it("will not move a training that has started, but saves a new title", async () => {
    const { updateTrainingAction } = await import("./actions");
    script("trainings", { data: [{ id: "t1", starts_at: PAST, cancelled_at: null, attendance: [] }] });
    expect(await updateTrainingAction("t1", { title: "Renamed", date: "2099-01-01", start: "10:00", minutes: 60 })).toEqual({
      ok: false,
      error: "It has started, so only the title and notes can change.",
    });
    expect(writes("trainings", "update")).toEqual([]);

    script("trainings", { data: [{ id: "t1", starts_at: PAST, cancelled_at: null, attendance: [] }] }, { data: null });
    expect(await updateTrainingAction("t1", { title: "Renamed" })).toEqual({ ok: true });
    const update = writes("trainings", "update")[0];
    expect(update?.payloads[0]).toEqual({ title: "Renamed", notes: null });
    expect(update?.filters).toContainEqual(["eq", "organiser_id", "me"]);
  });

  it("withdraws a scheduled training whose people could not be added", async () => {
    script("training_types", { data: [{ id: ID }] });
    script("trainings", { data: { id: "t5" } }, { data: null });
    script("training_attendance", { error: { message: "boom" } });
    const { scheduleTrainingAction } = await import("./actions");
    expect(await scheduleTrainingAction({ ...schedule, personIds: ["1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f"] })).toEqual({ ok: false, error: "Could not schedule that. Try again." });
    expect(writes("trainings", "update")[0]?.payloads[0]).toMatchObject({ cancelled_by: "me" });
  });

  it("changes who is on it before the training itself", async () => {
    const keep = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
    script("trainings", { data: [{ id: "t1", starts_at: FUTURE, cancelled_at: null, attendance: [{ person_id: "gone", removed_at: null }] }] }, { data: null });
    script("training_attendance", { data: null }, { data: null });
    const { updateTrainingAction } = await import("./actions");
    expect(await updateTrainingAction("t1", { title: "Workshop", personIds: [keep] })).toEqual({ ok: true });
    const order = calls.filter((c) => c.ops.includes("update") || c.ops.includes("insert")).sort((a, b) => (a.resolvedAt ?? 0) - (b.resolvedAt ?? 0)).map((c) => c.table);
    expect(order[order.length - 1]).toBe("trainings");
  });

  it("takes a person off before it starts by marking them removed, never deleting", async () => {
    const keep = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
    script("trainings", { data: [{ id: "t1", starts_at: FUTURE, cancelled_at: null, attendance: [{ person_id: keep, removed_at: null }, { person_id: "gone", removed_at: null }] }] }, { data: null });
    script("training_attendance", { data: null });
    const { updateTrainingAction } = await import("./actions");
    expect(await updateTrainingAction("t1", { title: "Workshop", personIds: [keep] })).toEqual({ ok: true });
    expect(writes("training_attendance", "delete")).toEqual([]);
    expect(writes("training_attendance", "update")[0]?.payloads[0]).toMatchObject({ removed_by: "me" });
  });

  // A put-back used to reset the status and keep the source, so a person the
  // organiser had marked absent came back pending with source organiser, and no
  // transcript would ever fill their row again (A.40).
  it("puts a person back with no word on their row, the source included", async () => {
    const back = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
    script("trainings", { data: [{ id: "t1", starts_at: FUTURE, cancelled_at: null, attendance: [{ person_id: back, removed_at: PAST }] }] }, { data: null });
    script("training_attendance", { data: null });
    const { updateTrainingAction } = await import("./actions");
    expect(await updateTrainingAction("t1", { title: "Workshop", personIds: [back] })).toEqual({ ok: true });
    expect(writes("training_attendance", "update")[0]?.payloads[0]).toEqual({ removed_at: null, removed_by: null, status: "pending", source: "member", skip_reason: null, answered_at: null });
  });
});
