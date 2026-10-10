import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// W.120. setCardSprint is where the drawer, the list, quick-add and the
// planning panel all commit a card, so the sprint lock is enforced here and
// not only by the panel hiding its controls. The rule itself is
// sprint-lock.test.ts's; what this pins is that the action asks it, about
// both ends of the move, before anything is written.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/entities/boards/lib/access", () => ({
  boardActorFor: vi.fn(async () => ({ label: "tester", personId: "person-1", isAdmin: true })),
}));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createSprint, setCardSprint } = await import("./sprint-actions");
const { addDays, isoWeekKey, saigonToday } = await import("@/kernel/config/dates");

beforeEach(() => resetFake());
afterEach(() => vi.clearAllMocks());

// Far from any real date, so the suite does not depend on the day it runs.
const NOT_STARTED = "2999-01-01";
const STARTED = "2000-01-01";
const sprint = (id: string, over: Record<string, unknown> = {}) => ({ id, board_id: "board-1", name: `Sprint ${id}`, locked_at: null, starts_on: STARTED, ...over });
const wrote = () => calls.some((c) => c.ops.includes("update"));

describe("setCardSprint and the sprint lock (W.120)", () => {
  it("refuses committing a card to a locked sprint that has not started, and writes nothing", async () => {
    script("tasks", { data: { board_id: "board-1", sprint_id: null } });
    script("sprints", { data: [sprint("next", { locked_at: "2026-09-22T09:00:00Z", starts_on: NOT_STARTED })] });
    const r = await setCardSprint("task-1", "next", "board");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Sprint next is locked");
    expect(wrote()).toBe(false);
  });

  it("refuses taking a card out of one", async () => {
    script("tasks", { data: { board_id: "board-1", sprint_id: "next" } });
    script("sprints", { data: [sprint("next", { locked_at: "2026-09-22T09:00:00Z", starts_on: NOT_STARTED })] });
    const r = await setCardSprint("task-1", null, "board");
    expect(r.ok).toBe(false);
    expect(wrote()).toBe(false);
  });

  it("lets the move through once the locked sprint has started", async () => {
    script("tasks", { data: { board_id: "board-1", sprint_id: null } });
    script("sprints", { data: [sprint("now", { locked_at: "2026-09-15T09:00:00Z", starts_on: STARTED })] });
    script("tasks", { data: null }); // the card's new sprint
    script("task_stage_log", { data: null }); // and its history row
    expect(await setCardSprint("task-1", "now", "board")).toEqual({ ok: true });
    expect(wrote()).toBe(true);
  });

  it("still refuses a sprint on another board", async () => {
    script("tasks", { data: { board_id: "board-1", sprint_id: null } });
    script("sprints", { data: [sprint("elsewhere", { board_id: "board-2" })] });
    expect(await setCardSprint("task-1", "elsewhere", "board")).toEqual({ ok: false, error: "That sprint is not on this board." });
    expect(wrote()).toBe(false);
  });
});

// W.146. On 2026-08-31 a sprint was created with starts_on 1972-09-01 and
// ends_on 1972-09-08: the date input handed the action a year that was off by
// 54, and createSprint stored whatever string it was given. The SW-01 backfill
// then keyed it 1972-W35, a correction by SQL moved the date to 2026 without
// the key, and Sprint Planning's week picker offered a week in 1972. A sprint
// is a week of work, so a start or end more than a year from today is a
// mistyped year, never a plan; and a sprint cannot end before it starts.
describe("createSprint refuses a date that cannot be a sprint's (W.146)", () => {
  const inserted = () => calls.some((c) => c.table === "sprints" && c.ops.includes("insert"));

  it("refuses the 1972 dates that reached production, and writes nothing", async () => {
    const r = await createSprint("board-1", { name: "Infinite Leverage 1", startsOn: "1972-09-01", endsOn: "1972-09-08" }, "board");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("1972");
    expect(inserted()).toBe(false);
  });

  it("refuses the year 0026 that a two-digit year gives in Chrome's date input", async () => {
    const r = await createSprint("board-1", { name: "S", startsOn: "0026-09-01", endsOn: "0026-09-08" }, "board");
    expect(r.ok).toBe(false);
    expect(inserted()).toBe(false);
  });

  it("refuses an end date more than a year away even when the start is fine", async () => {
    const start = saigonToday();
    const r = await createSprint("board-1", { name: "S", startsOn: start, endsOn: addDays(start, 400) }, "board");
    expect(r.ok).toBe(false);
    expect(inserted()).toBe(false);
  });

  it("refuses a sprint that ends before it starts", async () => {
    const start = saigonToday();
    const r = await createSprint("board-1", { name: "S", startsOn: start, endsOn: addDays(start, -1) }, "board");
    expect(r).toEqual({ ok: false, error: "A sprint cannot end before it starts." });
    expect(inserted()).toBe(false);
  });

  it("stores this year's dates, keyed to the week of the first day", async () => {
    const start = saigonToday();
    script("sprints", { data: { id: "new" } });
    expect(await createSprint("board-1", { name: "S", startsOn: start, endsOn: addDays(start, 6) }, "board")).toEqual({ ok: true, id: "new" });
    const row = calls.find((c) => c.table === "sprints" && c.ops.includes("insert"))?.payloads[0] as { starts_on: string; week: string };
    expect(row.starts_on).toBe(start);
    expect(row.week).toBe(isoWeekKey(start));
  });
});
