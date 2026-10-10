import { describe, expect, it, vi } from "vitest";

// Y.72.1: a run whose tick is claimed puts its id on the async chain, so every
// AI call inside it lands in ai_calls with that run_id.

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    rpc: async () => ({ data: "run-7", error: null }),
    from: () => ({
      update: () => ({ eq: () => ({ in: () => ({ select: async () => ({ data: [{ id: "run-7" }], error: null }) }) }) }),
    }),
  },
}));
vi.mock("@/kernel/messaging/lark", () => ({ notifyOps: vi.fn(async () => true) }));

const { currentRunId, recordRoutineRun } = await import("@/kernel/audit/routine-runs");

describe("currentRunId", () => {
  it("is the claimed run's id inside the handler, across awaits", async () => {
    let inside: string | null = null;
    await recordRoutineRun("/api/cron/thing/", async () => {
      await new Promise((r) => setTimeout(r, 1));
      inside = currentRunId();
      return Response.json({ status: "ok" });
    });
    expect(inside).toBe("run-7");
    expect(currentRunId()).toBeNull();
  });
});
