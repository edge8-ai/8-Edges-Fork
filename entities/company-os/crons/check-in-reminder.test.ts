import { beforeEach, describe, expect, it, vi } from "vitest";

// The reminder owes the same honesty as the check-in: a chat only counts as
// reminded when Lark takes the message, and an undelivered chat fails the run
// and names the variable to set. On 2026-09-15 the run reported both chats while
// the EO chat received nothing.

const accepts = { product: true, eo: true, ops: true };
const sent: string[] = [];

vi.mock("@/kernel/messaging/lark", () => ({
  notifyProduct: vi.fn(async () => {
    sent.push("product");
    return accepts.product;
  }),
  notifyEo: vi.fn(async () => {
    sent.push("eo");
    return accepts.eo;
  }),
  notifyOps: vi.fn(async () => {
    sent.push("ops");
    return accepts.ops;
  }),
}));
// The bearer gate and the run recording are the kernel's and tested there; a
// pass-through keeps this test on what the reminder itself decides, and the real
// outcome rule (Y.13) turns the reminder's failures into the 500.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));

import { GET } from "./check-in-reminder";

async function run(): Promise<{ status: number; body: { reminded: string[]; error?: string; failures?: { subject: string; step: string; error: string }[] } }> {
  const res = await GET(new Request("https://example.test/api/cron/check-in-reminder/"));
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  accepts.product = true;
  accepts.eo = true;
  accepts.ops = true;
  sent.length = 0;
});

describe("check-in reminder", () => {
  it("sends to every chat and reports all three when Lark takes them", async () => {
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(sent.sort()).toEqual(["eo", "ops", "product"]);
    expect(body).toEqual({ status: "ok", reminded: ["product", "eo", "ops"], failures: [] });
  });

  it("fails the run and names the EO variable when the EO chat does not take it", async () => {
    accepts.eo = false;
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body.reminded).toEqual(["product", "ops"]);
    expect(body.error).toBe("EO at reminder: Lark did not accept the reminder (LARK_EO_WEBHOOK_URL)");
    expect(body.failures).toEqual([{ subject: "EO", step: "reminder", error: "Lark did not accept the reminder (LARK_EO_WEBHOOK_URL)" }]);
  });

  it("still tries the other chats when the first one fails", async () => {
    accepts.product = false;
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(sent.sort()).toEqual(["eo", "ops", "product"]);
    expect(body.reminded).toEqual(["eo", "ops"]);
  });
});
