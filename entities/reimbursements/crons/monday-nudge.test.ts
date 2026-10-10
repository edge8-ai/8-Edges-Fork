import { describe, expect, it, vi } from "vitest";

// The Monday nudge's cron (design §1.8): 08:00 Vietnam time on Mondays, keyed
// by that day; a failed run is an error someone sees.
// The real outcome rule (Y.13) decides the response; only the bearer and run row are stubbed.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
let fails = false;
let report: Record<string, unknown> = { check: 1, approve: 0, skipped: [], failed: [] };
const days: string[] = [];
vi.mock("@/entities/reimbursements/lib/nudges", () => ({
  sendMondayNudges: async (today: string) => {
    if (fails) throw new Error("db down");
    days.push(today);
    return report;
  },
}));

const { GET, schedule } = await import("./monday-nudge");
const run = async () => {
  const res = await GET(new Request("https://os.example/api/cron/monday-nudge/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

describe("the Monday nudge cron", () => {
  it("fires at 08:00 Vietnam time every Monday", () => {
    expect(schedule).toBe("0 1 * * 1");
  });

  it("sends the day's nudges and reports what went", async () => {
    expect(await run()).toEqual({ status: 200, body: { status: "ok", check: 1, approve: 0, skipped: [], failed: [], failures: [] } });
    expect(days[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("answers an error when the nudges could not be worked out", async () => {
    fails = true;
    expect(await run()).toEqual({ status: 500, body: { error: "db down" } });
    fails = false;
  });

  it("is skipped, not ok, when no queue had a claim waiting on anyone", async () => {
    report = { check: 0, approve: 0, skipped: [], failed: [] };
    expect(await run()).toMatchObject({ status: 200, body: { status: "skipped", reason: "no queue had a claim waiting on anyone" } });
  });

  // Y.23: an email that did not go was only left out of the count; now it names the person.
  it("is an error that names each person whose nudge email was not sent", async () => {
    report = { check: 0, approve: 1, skipped: [], failed: ["Finley: the check nudge email was not sent"] };
    expect(await run()).toMatchObject({
      status: 500,
      body: { error: "Finley at send nudge email: the check nudge email was not sent", approve: 1 },
    });
  });
});
