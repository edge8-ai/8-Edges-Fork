import { beforeEach, describe, expect, it, vi } from "vitest";

// The daily broadcast recap (Y.22): a recap Lark did not take, or a latch that
// did not save, is a failure the run names after the broadcast.
// The real outcome rule (Y.13) decides the response; only the bearer and run row are stubbed.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
vi.mock("@/kernel/data/supabase", () => ({ companyOs: {} }));

const due = vi.hoisted(() => ({ rows: [] as unknown[], error: null as { message: string } | null }));
const latch = vi.hoisted(() => ({ error: null as { message: string } | null }));
vi.mock("@/entities/campaigns", () => {
  const select = () => {
    const q: Record<string, unknown> = { then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: due.rows, error: due.error }).then(resolve) };
    for (const op of ["eq", "is", "lte", "order", "limit"]) q[op] = () => q;
    return q;
  };
  return {
    selectEmailCampaigns: select,
    updateEmailCampaigns: () => ({ eq: async () => ({ error: latch.error }) }),
    getBroadcastStats: async () => ({ sent: 10, delivered: 9, opened: 5, clicked: 2 }),
    getBroadcastLinkStats: async () => [],
    getBroadcastUnsubscribes: async () => 0,
  };
});
vi.mock("@/entities/company-os/lib/ai/broadcast-takeaway", () => ({ generateBroadcastTakeaway: async () => "A good one." }));
const notifyMarketing = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/kernel/messaging/lark", () => ({ notifyMarketing }));

import { GET } from "./broadcast-summary";

const run = async () => {
  const res = await GET(new Request("https://os.example/api/cron/broadcast-summary/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

beforeEach(() => {
  due.rows = [{ id: "b1", name: "October letter", subject: "Hello", approved_at: null }];
  due.error = null;
  latch.error = null;
  notifyMarketing.mockReset();
  notifyMarketing.mockResolvedValue(true);
});

describe("the broadcast summary cron", () => {
  it("is skipped when no broadcast has settled", async () => {
    due.rows = [];
    expect(await run()).toMatchObject({ status: 200, body: { status: "skipped", due: 0, posted: 0 } });
  });

  it("is an ok run when the recap went out and latched", async () => {
    expect(await run()).toMatchObject({ status: 200, body: { status: "ok", due: 1, posted: 1, failures: [] } });
  });

  it("is an error that names the broadcast when Lark did not take its recap", async () => {
    notifyMarketing.mockResolvedValue(false);
    expect(await run()).toMatchObject({
      status: 500,
      body: { error: "October letter at post the recap: Lark did not accept the Marketing recap (LARK_MARKETING_WEBHOOK_URL)", posted: 0 },
    });
  });

  it("is an error that names the broadcast when the latch did not save", async () => {
    latch.error = { message: "write refused" };
    expect(await run()).toMatchObject({ status: 500, body: { error: "October letter at latch the recap: write refused", posted: 0 } });
  });

  it("a due list that could not be read stays an early 500", async () => {
    due.error = { message: "db down" };
    expect(await run()).toEqual({ status: 500, body: { error: "db down" } });
  });
});
