import { describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/kernel/data/testing/fake-company-os";

// Y.20. An issue that could not be opened names its series, and the kernel's
// outcome rule makes the run an error.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
const openDueIssues = vi.hoisted(() => vi.fn());
vi.mock("@/entities/campaigns/lib/series", () => ({ openDueIssues }));

const { GET } = await import("./email-series-draft");
const run = async () => {
  const res = await GET(new Request("https://os.example/api/cron/email-series-draft/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

describe("the series drafter", () => {
  it("is ok when every due issue opened", async () => {
    openDueIssues.mockResolvedValue({ opened: [{ seriesId: "s1", campaignId: "c1", recipients: 12 }] });
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "ok", failed: 0, failures: [] });
  });

  it("names the series whose issue could not be opened", async () => {
    openDueIssues.mockResolvedValue({
      opened: [
        { seriesId: "s1", campaignId: "c1", recipients: 12 },
        { seriesId: "s2", campaignId: "", recipients: null, error: "audience is empty" },
      ],
    });
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body).toMatchObject({ failed: 1 });
    expect(body.error).toBe("series s2 at open issue: audience is empty");
  });

  it("stays a plain 500 when the series read itself fails", async () => {
    openDueIssues.mockResolvedValue({ opened: [], error: "db down" });
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body.error).toBe("db down");
  });
});
