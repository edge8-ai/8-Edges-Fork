import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The payment run's cron (design §1.7): on a 1st or a 15th it builds the run
// for that Vietnam date, and on any other day it builds nothing.
// The real outcome rule (Y.13) decides the response; only the bearer and run row are stubbed.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
const asked: string[] = [];
const NOTHING = { ok: true, built: false, reason: "Nothing was approved before the cut-off, so there is no run." };
let answer: Record<string, unknown> = NOTHING;
vi.mock("@/entities/reimbursements/lib/payment-runs", () => ({
  buildPaymentRun: async (date: string) => {
    asked.push(date);
    return answer;
  },
}));

const { GET, schedule } = await import("./payment-run");
const run = async () => {
  const res = await GET(new Request("https://os.example/api/cron/payment-run/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

beforeEach(() => {
  asked.length = 0;
  answer = NOTHING;
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => vi.useRealTimers());

describe("the payment run cron", () => {
  it("fires at 08:00 Vietnam time on the 1st and the 15th", () => {
    expect(schedule).toBe("0 1 1,15 * *");
  });

  it("builds the run for today's Vietnam date on a run day", async () => {
    vi.setSystemTime(new Date("2026-10-15T01:00:00Z"));
    expect(await run()).toEqual({ status: 200, body: { built: false, reason: "Nothing was approved before the cut-off, so there is no run." } });
    expect(asked).toEqual(["2026-10-15"]);
  });

  it("builds nothing on any other day", async () => {
    vi.setSystemTime(new Date("2026-10-16T01:00:00Z"));
    // status "skipped" is the only word the run record reads as skipped (Y.34, Y.88).
    expect(await run()).toEqual({ status: 200, body: { status: "skipped", reason: "2026-10-16 is not a run day" } });
    expect(asked).toEqual([]);
  });

  // Y.88: routine_runs.error and the repeated-failure alert read the body's error.
  it("a build that could not start is an error with its reason", async () => {
    vi.setSystemTime(new Date("2026-10-15T01:00:00Z"));
    answer = { ok: false, error: "Could not start the run: db down" };
    expect(await run()).toEqual({ status: 500, body: { error: "Could not start the run: db down" } });
  });

  it("a run with failed payments is an error that names them, and keeps the run's report", async () => {
    vi.setSystemTime(new Date("2026-10-15T01:00:00Z"));
    answer = { ok: true, built: true, runId: "run-1", notified: true, failed: ["person p1: insert failed"], carried: [] };
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body).toMatchObject({ runId: "run-1", failed: ["person p1: insert failed"], error: "person p1 at transfer: insert failed" });
  });
});
