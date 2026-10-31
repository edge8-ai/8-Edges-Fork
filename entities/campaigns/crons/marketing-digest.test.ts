import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Y.20. The founder's reminder returns the typed result: nothing due is
// skipped, and a channel that did not take the reminder names itself.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
vi.mock("@/kernel/config/dates", async (original) => ({
  ...(await original<typeof import("@/kernel/config/dates")>()),
  saigonToday: () => "2026-10-10",
}));
const accepts = vi.hoisted(() => ({ email: true, lark: true }));
vi.mock("@/kernel/messaging/email", () => ({ sendTransactionalEmail: vi.fn(async () => accepts.email) }));
// notify() is stubbed; failureOf stays real, so a failed notice fails the step
// as it does in production (Z.7.1). When the router holds the reminder is the
// router's own test (kernel/messaging/router.test.ts).
const notify = vi.hoisted(() =>
  vi.fn(async (_input: { kind: string; to: unknown; message: unknown; dedupeKey: string }) =>
    accepts.lark
      ? { status: "held" as const, until: "2026-10-12T01:30:00.000Z" }
      : { status: "failed" as const, error: "LARK_MARKETING_WEBHOOK_URL is not set" },
  ),
);
vi.mock("@/kernel/messaging/router", async (importActual) => ({
  ...(await importActual<typeof import("@/kernel/messaging/router")>()),
  notify,
}));

const { GET, schedule } = await import("./marketing-digest");
const run = async () => {
  const res = await GET(new Request("https://os.example/api/cron/marketing-digest/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const row = { id: "a", title: "A post", channel: "linkedin", publish_date: "2026-10-08", brands: { name: "Edge8" } };

beforeEach(() => {
  resetFake();
  notify.mockClear();
  accepts.email = true;
  accepts.lark = true;
});

describe("the marketing digest", () => {
  it("runs on weekdays only, at 09:00 Saigon time, so no weekend reminder is held to stack up on Monday", () => {
    // 02:00 UTC Monday to Friday. Monday's run lists everything due or overdue,
    // which covers what a weekend run would have said (Z.7.1).
    expect(schedule).toBe("0 2 * * 1-5");
  });

  it("is skipped when nothing is due", async () => {
    script("marketing_content", { data: [] });
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "skipped", due: 0, sent: false });
    expect(notify).not.toHaveBeenCalled();
  });

  it("is ok when both channels took the reminder", async () => {
    script("marketing_content", { data: [row] });
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "ok", due: 1, emailSent: true, notice: "held", failures: [] });
  });

  it("posts to the Revenue chat through the router as a quiet-hours kind, once per Saigon day", async () => {
    script("marketing_content", { data: [row] });
    await run();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({
      kind: "revenue.marketing-digest",
      to: { chat: "revenue" },
      dedupeKey: "campaigns:marketing-digest:2026-10-10",
    });
    expect(String(notify.mock.calls[0][0].message)).toContain("[LinkedIn] A post");
  });

  it("names the channel that did not take the reminder", async () => {
    script("marketing_content", { data: [row] });
    accepts.email = false;
    accepts.lark = false;
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body.error).toContain("at email: the reminder email was not sent");
    expect(body.error).toContain("Marketing chat at notify: LARK_MARKETING_WEBHOOK_URL is not set");
  });
});
