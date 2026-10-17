import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The failure alert. On 11 to 15 September 2026 the daily coaching cycle
// errored five runs in a row and nobody noticed until a table read on the
// 16th. withRoutineRun now posts to the Operations Lark chat when a routine
// errors on two consecutive runs, once per streak: the second error alerts,
// the third and later stay quiet, and a recovery resets the streak.

const inserted: unknown[] = [];
let previousRuns: { status: string }[] = [];

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    from: () => ({
      insert: (row: unknown) => {
        inserted.push(row);
        return { select: () => ({ single: async () => ({ data: { id: "run-1" }, error: null }) }) };
      },
      // The streak read, newest first. `in` applies its status filter the
      // way PostgREST would, so a running or waiting row in the history is
      // left out exactly when the reader asks for outcomes only.
      select: () => {
        let statuses: string[] | null = null;
        const chain = {
          eq: () => chain,
          neq: () => chain,
          lt: () => chain,
          in: (_col: string, vs: string[]) => {
            statuses = vs;
            return chain;
          },
          order: () => chain,
          limit: async (n: number) => ({
            data: previousRuns.filter((r) => !statuses || statuses.includes(r.status)).slice(0, n),
            error: null,
          }),
        };
        return chain;
      },
    }),
  },
}));

const notifyOps = vi.fn(async (_text: string) => true);
vi.mock("@/kernel/messaging/lark", () => ({ notifyOps: (text: string) => notifyOps(text) }));

const { withRoutineRun } = await import("@/kernel/audit/routine-runs");

const SECRET = "test-cron-secret";
const request = () => new Request("https://example.test/api/cron/thing", { headers: { authorization: `Bearer ${SECRET}` } });
const failing = async () => {
  throw new Error("boom");
};

describe("withRoutineRun failure alert", () => {
  const previous = process.env.CRON_SECRET;
  beforeEach(() => {
    inserted.length = 0;
    notifyOps.mockClear();
    process.env.CRON_SECRET = SECRET;
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  });

  it("stays quiet on the first error", async () => {
    previousRuns = [{ status: "ok" }];
    await withRoutineRun("/api/cron/thing/", request(), failing);
    expect(notifyOps).not.toHaveBeenCalled();
  });

  it("alerts once on the second consecutive error, naming the routine and the error", async () => {
    previousRuns = [{ status: "error" }, { status: "ok" }];
    await withRoutineRun("/api/cron/thing/", request(), failing);
    expect(notifyOps).toHaveBeenCalledTimes(1);
    const text = String(notifyOps.mock.calls[0]?.[0]);
    expect(text).toContain("/api/cron/thing/");
    expect(text).toContain("boom");
  });

  it("stays quiet on the third and later errors of the same streak", async () => {
    previousRuns = [{ status: "error" }, { status: "error" }];
    await withRoutineRun("/api/cron/thing/", request(), failing);
    expect(notifyOps).not.toHaveBeenCalled();
  });

  it("treats a routine with one earlier run as a streak of two", async () => {
    previousRuns = [{ status: "error" }];
    await withRoutineRun("/api/cron/thing/", request(), failing);
    expect(notifyOps).toHaveBeenCalledTimes(1);
  });

  it("counts a died run as a failure of the streak", async () => {
    previousRuns = [{ status: "died" }, { status: "ok" }];
    await withRoutineRun("/api/cron/thing/", request(), failing);
    expect(notifyOps).toHaveBeenCalledTimes(1);
  });

  it("stays quiet after a died run that already made a streak", async () => {
    previousRuns = [{ status: "error" }, { status: "died" }];
    await withRoutineRun("/api/cron/thing/", request(), failing);
    expect(notifyOps).not.toHaveBeenCalled();
  });

  it("looks past runs still running or waiting to the outcomes before them", async () => {
    previousRuns = [{ status: "running" }, { status: "waiting" }, { status: "error" }, { status: "ok" }];
    await withRoutineRun("/api/cron/thing/", request(), failing);
    expect(notifyOps).toHaveBeenCalledTimes(1);
  });

  it("never alerts on a successful run", async () => {
    previousRuns = [{ status: "error" }, { status: "error" }];
    await withRoutineRun("/api/cron/thing/", request(), async () => Response.json({ ok: true }));
    expect(notifyOps).not.toHaveBeenCalled();
  });
});
