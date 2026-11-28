import { describe, expect, it, vi } from "vitest";

// CR.5.5: the client review emails routine returns the run's counters through
// the typed result, so a send that went to fewer members than it meant to is
// an error run, and ?dry=1 passes through to the sender.

// The real outcome rule (Y.13) decides the response; only the bearer and run row are stubbed.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
const run = (over: Record<string, unknown> = {}) => ({
  scheduledCycles: 1,
  scheduledEmails: 2,
  reminderCycles: 0,
  reminderEmails: 0,
  held: 0,
  outcome: { expected: 2, done: 2, unit: "emails" as const },
  failures: [],
  ...over,
});
const sendDueMemberEmails = vi.fn(async (_now: Date, _opts: { dryRun?: boolean }) => run());
vi.mock("@/entities/org/lib/client-reviews/member-email-scheduler", () => ({
  sendDueMemberEmails: (now: Date, opts: { dryRun?: boolean }) => sendDueMemberEmails(now, opts),
}));

import { GET } from "./client-review-emails";

describe("the client-review-emails job", () => {
  it("answers ok with the run's counters, and passes ?dry=1 through", async () => {
    const res = await GET(new Request("https://example.test/api/cron/client-review-emails/?dry=1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", dryRun: true, ...run() });
    expect(sendDueMemberEmails).toHaveBeenCalledWith(expect.any(Date), { dryRun: true });
  });

  it("is an error run when fewer emails went than it meant to send", async () => {
    sendDueMemberEmails.mockImplementationOnce(async () => run({ scheduledEmails: 1, outcome: { expected: 2, done: 1, unit: "emails" } }));
    const res = await GET(new Request("https://example.test/api/cron/client-review-emails/"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("done 1 of 2 emails");
  });
});
