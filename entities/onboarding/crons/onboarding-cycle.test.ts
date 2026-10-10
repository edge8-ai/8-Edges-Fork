import { beforeEach, describe, expect, it, vi } from "vitest";

// Y.19, the reference port. A journey whose milestones threw used to be one
// more in a `failed` count inside a 200. The lib now names each by its journey
// id, and the kernel makes the run an error that says whose journey it was.

// The real outcome rule (Y.13) decides the response; only the bearer and run row are stubbed.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
const counters = { date: "2026-10-08", journeys: 3, backfilled: 0, planNags: 1, day8Sent: 0, reviewsSent: 0, decisionReminders: 0, promoted: 0, day180Sent: 0 };
let answer: Record<string, unknown> = counters;
vi.mock("@/entities/onboarding/lib/cycle", () => ({
  saigonToday: () => "2026-10-08",
  runOnboardingCycle: async () => answer,
}));

import { GET } from "./onboarding-cycle";

const run = async () => {
  const res = await GET(new Request("https://example.test/api/cron/onboarding-cycle/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

describe("the onboarding-cycle job", () => {
  beforeEach(() => {
    answer = counters;
  });

  it("answers ok with every counter when no journey failed", async () => {
    expect(await run()).toEqual({ status: 200, body: { status: "ok", ...counters } });
  });

  it("a journey that threw is an error run that names the journey by id", async () => {
    answer = {
      ...counters,
      failed: 1,
      failures: [{ subject: "journey j-9", step: "milestones", error: "stage not written: db down" }],
    };
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body.error).toBe("journey j-9 at milestones: stage not written: db down");
    expect(body).toMatchObject({ journeys: 3, planNags: 1, failed: 1 });
  });
});
