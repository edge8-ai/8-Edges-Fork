import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Y.20. The weekly letter returns the typed result: a letter still waiting is
// skipped, and a first step that failed its checks names the letter. The first
// step still runs through runLetterStepNow.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
vi.mock("@/entities/campaigns/lib/brand-profiles", () => ({ getBrandProfileBySlug: vi.fn(async () => ({ brandId: "brand" })) }));
const startLetterRun = vi.hoisted(() => vi.fn());
const runLetterStepNow = vi.hoisted(() => vi.fn());
vi.mock("@/entities/campaigns/lib/letter/advance", () => ({ startLetterRun }));
vi.mock("@/entities/campaigns/lib/letter/run-step", () => ({ runLetterStepNow }));

const { GET } = await import("./letter-weekly");
const run = async () => {
  const res = await GET(new Request("https://os.example/api/cron/letter-weekly/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

beforeEach(() => {
  resetFake();
  startLetterRun.mockReset();
  startLetterRun.mockResolvedValue({ ok: true });
  runLetterStepNow.mockReset();
});

describe("the weekly letter", () => {
  it("is skipped while a letter the agent opened is still unsent", async () => {
    script("email_campaigns", { data: [{ id: "c0", status: "draft" }] });
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "skipped", opened: false, waiting: "c0" });
  });

  it("opens the letter and runs its first step", async () => {
    script("email_campaigns", { data: [] }, { data: [] }, { data: { id: "c1" } });
    runLetterStepNow.mockResolvedValue({ ok: true, campaignId: "c1", step: "gather", next: "write", summary: "Gathered." });
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "ok", opened: true, campaign: "c1", failures: [] });
    expect(runLetterStepNow).toHaveBeenCalledWith("c1");
  });

  it("names the letter whose first step failed its checks", async () => {
    script("email_campaigns", { data: [] }, { data: [] }, { data: { id: "c1" } });
    runLetterStepNow.mockResolvedValue({ ok: false, campaignId: "c1", step: "gather", error: "no events this week" });
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body.error).toBe("letter c1 at gather: no events this week");
  });
});
