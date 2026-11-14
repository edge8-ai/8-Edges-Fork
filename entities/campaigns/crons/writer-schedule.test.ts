import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Y.20. A campaign whose writer could not start names itself, as does a notice
// Lark did not take; the first step still runs through runWriterStepNow.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
const startWriterRun = vi.hoisted(() => vi.fn());
const runWriterStepNow = vi.hoisted(() => vi.fn());
vi.mock("@/entities/campaigns/lib/writer/advance", () => ({ startWriterRun }));
vi.mock("@/entities/campaigns/lib/writer/run-step", () => ({ runWriterStepNow }));
vi.mock("@/entities/campaigns/lib/writer/schedule", () => ({ startsWithinWindow: () => true }));
const accepts = vi.hoisted(() => ({ lark: true }));
vi.mock("@/kernel/messaging/lark", () => ({ notifyMarketing: vi.fn(async () => accepts.lark) }));

const { GET } = await import("./writer-schedule");
const run = async () => {
  const res = await GET(new Request("https://os.example/api/cron/writer-schedule/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const campaign = (id: string, name: string) => ({
  id,
  name,
  brand_id: "brand",
  idea: "An idea",
  starts_on: "2026-10-10",
  writer_step: null,
  writer_error: null,
  writer_started_at: null,
});

beforeEach(() => {
  resetFake();
  accepts.lark = true;
  startWriterRun.mockReset();
  startWriterRun.mockResolvedValue({ ok: true });
  runWriterStepNow.mockReset();
  runWriterStepNow.mockResolvedValue({ ok: true, campaignId: "c1", step: "draft", next: "edit", summary: "Drafted." });
});

describe("the writer schedule", () => {
  it("starts the writer on a campaign that is due, through the first step", async () => {
    script("marketing_campaigns", { data: [campaign("c1", "Autumn push")] });
    script("marketing_content", { data: [] });
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "ok", checked: 1, started: ["Autumn push"], failed: [], failures: [] });
    expect(runWriterStepNow).toHaveBeenCalledWith("c1");
  });

  it("names the campaign whose writer could not start, and makes the run an error", async () => {
    script("marketing_campaigns", { data: [campaign("c1", "Autumn push")] });
    script("marketing_content", { data: [] });
    startWriterRun.mockResolvedValue({ ok: false, error: "no brand voice" });
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body.error).toBe("Autumn push at start writer: no brand voice");
  });

  it("names the chat when Lark does not take the notice", async () => {
    script("marketing_campaigns", { data: [campaign("c1", "Autumn push")] });
    script("marketing_content", { data: [] });
    accepts.lark = false;
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body.error).toContain("Marketing chat at notify");
  });
});
