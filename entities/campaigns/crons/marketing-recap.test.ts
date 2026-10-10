import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Y.20. The monthly recap returns the typed result: a month with nothing to
// recap is skipped, and a channel that did not take the stored recap names itself.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
const generate = vi.hoisted(() => vi.fn());
vi.mock("../lib/ai/marketing-recap", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/ai/marketing-recap")>()),
  generateMarketingRecap: generate,
}));
const accepts = vi.hoisted(() => ({ email: true, lark: true }));
vi.mock("@/kernel/messaging/email", () => ({ sendTransactionalEmail: vi.fn(async () => accepts.email) }));
vi.mock("@/kernel/messaging/lark", () => ({ notifyMarketing: vi.fn(async () => accepts.lark) }));

const { GET } = await import("./marketing-recap");
const run = async () => {
  const res = await GET(new Request("https://os.example/api/cron/marketing-recap/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const recap = {
  readout: "A steady month.",
  suggestions: [{ title: "A how-to", rationale: "Readers asked." }],
  metrics: { broadcasts: 2, sent: 100, delivered: 98, opened: 40, clicked: 9, unsubscribed: 1 },
  model: "test-model",
};

beforeEach(() => {
  resetFake();
  accepts.email = true;
  accepts.lark = true;
  generate.mockReset();
  generate.mockResolvedValue(recap);
});

describe("the marketing recap", () => {
  it("is skipped when there is nothing to recap", async () => {
    generate.mockResolvedValue(null);
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "skipped" });
  });

  it("is ok when the recap is stored and both channels took it", async () => {
    script("marketing_recaps", { data: null });
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "ok", broadcasts: 2, emailSent: true, failures: [] });
  });

  it("names the channels that did not take the recap", async () => {
    script("marketing_recaps", { data: null });
    accepts.email = false;
    accepts.lark = false;
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body.error).toContain("Marketing chat at notify");
    expect(body.error).toContain("at email: the recap email was not sent");
  });

  it("stays a plain 500 when the recap could not be stored", async () => {
    script("marketing_recaps", { error: { message: "write denied" } });
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body.error).toBe("write denied");
  });
});
