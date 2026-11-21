import { describe, expect, it, vi } from "vitest";

// Y.19. The daily coaching pass returns its summary through the typed result.
// Its lib collects no per-profile failure yet, so a pass that returns is ok.

// The real outcome rule (Y.13) decides the response; only the bearer and run row are stubbed.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
vi.mock("@/entities/coaching", () => ({ saigonToday: () => "2026-10-08" }));
const summary = { date: "2026-10-08", profiles: 3, prepsGenerated: 1, checkinsSent: 2, trendsGenerated: 0, adoptionNudges: 0 };
vi.mock("@/entities/coaching/lib/cycle", () => ({ runCoachingCycle: async (today: string) => ({ ...summary, date: today }) }));

import { GET } from "./coaching-cycle";

describe("the coaching-cycle job", () => {
  it("answers ok with every counter the pass reported", async () => {
    const res = await GET(new Request("https://example.test/api/cron/coaching-cycle/"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", ...summary });
  });
});
