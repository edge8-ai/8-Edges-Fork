import { beforeEach, describe, expect, it, vi } from "vitest";

// Y.47: the backstop repeats coaching's two event handlers from the tables, so
// an event the bus dropped still lands. It calls the real handlers' entry
// points; their own tests pin what each one writes.

const tasks = vi.hoisted(() => ({ value: { data: [] as unknown[], error: null as { message: string } | null } }));
const leaves = vi.hoisted(() => ({ value: { data: [] as unknown[], error: null as { message: string } | null } }));
const chain = (res: { value: unknown }) => {
  const b: Record<string, unknown> = { then: (r: (v: unknown) => unknown) => Promise.resolve(res.value).then(r) };
  for (const op of ["eq", "gte"]) b[op] = () => b;
  return b;
};
vi.mock("@/entities/boards", () => ({ SUBJECT_COMMITMENT: "coaching_commitment", selectTasks: () => chain(tasks) }));
vi.mock("@/entities/time-off", () => ({ selectTimeOff: () => chain(leaves) }));
const stamp = vi.fn(async (_p: unknown) => undefined);
const move = vi.fn(async (_p: unknown) => undefined);
vi.mock("@/entities/coaching/lib/board-subscriptions", () => ({ suggestCommitmentKept: (p: unknown) => stamp(p) }));
vi.mock("@/entities/coaching/lib/leave-subscriptions", () => ({ moveOneOnOnesOffLeave: (p: unknown) => move(p) }));
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));

const { GET, schedule } = await import("./coaching-backstops");
const run = async () => {
  const res = await GET(new Request("https://example.test/api/cron/coaching-backstops/"));
  return { status: res.status, body: await res.json() };
};

beforeEach(() => {
  stamp.mockReset();
  move.mockReset();
  tasks.value = { data: [], error: null };
  leaves.value = { data: [], error: null };
});

describe("coaching backstops (Y.47)", () => {
  it("runs nightly", () => {
    expect(schedule).toBe("0 21 * * *");
  });

  it("repeats the card-done stamp for every done commitment card and the leave move for every live approval", async () => {
    tasks.value = { data: [{ id: "t1", subject_id: "c1" }, { id: "t2", subject_id: null }], error: null };
    leaves.value = { data: [{ id: "l1", team_member_id: "tm1", start_date: "2026-10-10", end_date: "2026-10-12", leave_type: "annual" }], error: null };
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(stamp).toHaveBeenCalledWith(expect.objectContaining({ subjectType: "coaching_commitment", subjectId: "c1" }));
    expect(stamp).toHaveBeenCalledTimes(1);
    expect(move).toHaveBeenCalledWith(expect.objectContaining({ teamMemberId: "tm1", startDate: "2026-10-10", endDate: "2026-10-12" }));
    expect(body).toMatchObject({ cardsChecked: 1, leavesChecked: 1 });
  });

  it("records a failed read or a failed repeat as an error run that names it, and still does the rest", async () => {
    tasks.value = { data: null as never, error: { message: "timeout" } };
    leaves.value = { data: [{ id: "l1", team_member_id: "tm1", start_date: "2026-10-10", end_date: "2026-10-12", leave_type: "annual" }], error: null };
    move.mockRejectedValueOnce(new Error("unique index"));
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body.error).toContain("workboard cards at read: timeout");
    expect(body.error).toContain("leave l1 at move 1-1s: unique index");
  });
});
