import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Y.20. The weekly pulse posts whatever it could read and names what it could
// not: a read that failed leaves a zero in the post, so the run must say so.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
const overview = vi.hoisted(() => vi.fn());
vi.mock("@/entities/company-os", () => ({ getAnalyticsOverview: overview, getTrafficCount: vi.fn(async () => null) }));
vi.mock("@/entities/campaigns/lib/broadcasts", () => ({
  getBroadcastStats: vi.fn(async () => ({ sent: 10, delivered: 10, opened: 5, clicked: 1 })),
}));
const accepts = vi.hoisted(() => ({ lark: true }));
// notify() is stubbed; failureOf stays real (Z.7).
vi.mock("@/kernel/messaging/router", async (importActual) => ({
  ...(await importActual<typeof import("@/kernel/messaging/router")>()),
  notify: vi.fn(async () => (accepts.lark ? { status: "held", until: "2026-10-14T01:30:00.000Z" } : { status: "failed", error: "LARK_MARKETING_WEBHOOK_URL is not set" })),
}));

const { GET } = await import("./marketing-weekly-pulse");
const run = async () => {
  const res = await GET(new Request("https://os.example/api/cron/marketing-weekly-pulse/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

beforeEach(() => {
  resetFake();
  accepts.lark = true;
  overview.mockReset();
  overview.mockResolvedValue({ totals: { pageviews: 120, visitors: 80 }, topPages: [], byChannel: [] });
});

describe("the marketing weekly pulse", () => {
  it("is ok when every read and the post worked", async () => {
    script("marketing_content", { data: [{ channel: "blog" }] });
    script("email_campaigns", { data: [{ id: "c1", name: "Letter 01" }] });
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "ok", pageviews: 120, postsPublished: 1, broadcastsSent: 1, failures: [] });
  });

  it("names each read that failed and a post Lark did not take", async () => {
    script("marketing_content", { error: { message: "posts down" } });
    script("email_campaigns", { error: { message: "broadcasts down" } });
    overview.mockResolvedValue({ error: "VERCEL_ANALYTICS_TOKEN is not set." });
    accepts.lark = false;
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body.error).toContain("public-site traffic at read: VERCEL_ANALYTICS_TOKEN is not set.");
    expect(body.error).toContain("published posts at read: posts down");
    expect(body.error).toContain("sent broadcasts at read: broadcasts down");
    expect(body.error).toContain("Marketing chat at notify");
  });
});
