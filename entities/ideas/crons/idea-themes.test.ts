import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// W.189: the morning routine stores the themes, or says why it stored none.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
// The real outcome rule (Y.13) decides the response; only the bearer and run row are stubbed.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
const generateIdeaTrends = vi.hoisted(() => vi.fn());
vi.mock("@/entities/ideas/lib/ai/idea-trends", () => ({ generateIdeaTrends }));

import { GET } from "./idea-themes";

const run = { themes: [{ kind: "build", title: "T", gist: "G", ideaIds: ["a", "b"], relatedIds: [], repeats: [] }], sourceCount: 44, model: "claude-haiku" };

beforeEach(() => {
  resetFake();
  generateIdeaTrends.mockReset();
});

describe("idea-themes routine", () => {
  it("stores this morning's themes in idea_trend_reports", async () => {
    generateIdeaTrends.mockResolvedValue(run);
    script("idea_trend_reports", { error: null });
    const res = await GET(new Request("https://os.example/api/cron/idea-themes/"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", themes: 1, sparks: 44, model: "claude-haiku" });
    const insert = calls.find((c) => c.table === "idea_trend_reports" && c.ops[0] === "insert")!;
    expect(insert.payloads[0]).toEqual({ themes: run.themes, source_count: 44, model: "claude-haiku" });
  });

  it("writes nothing and marks the run skipped when there are no themes", async () => {
    generateIdeaTrends.mockResolvedValue(null);
    const res = await GET(new Request("https://os.example/api/cron/idea-themes/"));
    expect((await res.json()).status).toBe("skipped");
    expect(calls.filter((c) => c.table === "idea_trend_reports")).toHaveLength(0);
  });

  it("fails the run when the row cannot be stored", async () => {
    generateIdeaTrends.mockResolvedValue(run);
    script("idea_trend_reports", { error: { message: "permission denied" } });
    const res = await GET(new Request("https://os.example/api/cron/idea-themes/"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "themes not stored: permission denied" });
  });
});
