import { describe, expect, it, vi } from "vitest";

// Y.21. The daily review scheduler returns its counters through the typed
// result; it throws on a failed read, so a normal exit has nothing to name.

// The real outcome rule (Y.13) decides the response; only the bearer and run row are stubbed.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
vi.mock("@/kernel/config/dates", () => ({ saigonToday: () => "2026-10-08" }));
const runReviewScheduler = vi.fn(async (date: string, _opts: { dryRun?: boolean }) => ({
  date,
  opened: [{ name: "A Member", type: "probation" }],
  remindersSent: 2,
  skippedNoManager: ["B Member"],
}));
vi.mock("@/entities/team/lib/review-scheduler", () => ({
  runReviewScheduler: (date: string, opts: { dryRun?: boolean }) => runReviewScheduler(date, opts),
}));

import { GET } from "./performance-reviews";

describe("the performance-reviews job", () => {
  it("answers ok with the day's counters, and passes ?dry=1 through", async () => {
    const res = await GET(new Request("https://example.test/api/cron/performance-reviews/?dry=1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "ok",
      dryRun: true,
      date: "2026-10-08",
      opened: 1,
      openedDetail: [{ name: "A Member", type: "probation" }],
      remindersSent: 2,
      skippedNoManager: 1,
    });
    expect(runReviewScheduler).toHaveBeenCalledWith("2026-10-08", { dryRun: true });
  });
});
