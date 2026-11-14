import { describe, expect, it, vi } from "vitest";

// The reminders' cron: 08:00 Vietnam time on weekdays, keyed by that day; a failed run is an
// error someone sees. The real outcome rule decides the response; only the bearer and run row are stubbed.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
let fails = false;
let report: Record<string, unknown> = { reminded: 1, overdue: 0, failed: [] };
const days: string[] = [];
vi.mock("@/entities/reimbursements/lib/advance-reminders", () => ({
  sendAdvanceReminders: async (today: string) => {
    if (fails) throw new Error("db down");
    days.push(today);
    return report;
  },
}));

const { GET, schedule } = await import("./advance-reminders");
const run = async () => {
  const res = await GET(new Request("https://os.example/api/cron/advance-reminders/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

describe("the advance reminders cron", () => {
  it("fires at 08:00 Vietnam time on weekdays", () => {
    expect(schedule).toBe("0 1 * * 1-5");
  });

  it("sends the day's reminders and reports what went", async () => {
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "ok", reminded: 1, overdue: 0 });
    expect(days[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("says it skipped when nobody was due", async () => {
    report = { reminded: 0, overdue: 0, failed: [] };
    expect((await run()).body).toMatchObject({ status: "skipped" });
  });

  it("is an error when a reminder failed", async () => {
    report = { reminded: 0, overdue: 0, failed: ["advance a: refused"] };
    expect((await run()).status).toBe(500);
  });

  it("answers an error when the reminders could not be worked out", async () => {
    fails = true;
    expect(await run()).toEqual({ status: 500, body: { error: "db down" } });
    fails = false;
  });
});
