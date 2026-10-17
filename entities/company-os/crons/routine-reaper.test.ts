import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import vercelConfig from "@/vercel.json";

// The routine reaper (Y.6): every five minutes it marks running rows past
// their step deadline as died and tells Operations. Its own run is recorded
// like any cron's, and a reap it could not do, or an alert Lark did not take,
// is a failed run rather than a quiet one.

// withRoutineRun stays real, so the bearer gate and the recording stay under
// test; only the reap itself is scripted (kernel/audit tests cover it).
const reap = vi.fn();
vi.mock("@/kernel/audit/routine-reaper", () => ({ reapDiedRuns: (now?: Date) => reap(now) }));
const markUnknown = vi.fn();
vi.mock("@/kernel/audit/effects", () => ({ markUnknownEffects: (now?: Date) => markUnknown(now) }));
vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: "run-1" }, error: null }) }) }),
    }),
  },
}));
vi.mock("@/kernel/messaging/lark", () => ({ notifyOps: async () => true }));

const { GET } = await import("./routine-reaper");

const SECRET = "reaper-secret";
const request = (auth = `Bearer ${SECRET}`) => new Request("https://example.test/api/cron/routine-reaper/", { headers: { authorization: auth } });

describe("routine-reaper cron", () => {
  const previous = process.env.CRON_SECRET;
  beforeEach(() => {
    reap.mockReset();
    markUnknown.mockReset();
    markUnknown.mockResolvedValue({ unknown: [], alerted: true });
    process.env.CRON_SECRET = SECRET;
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  });

  it("runs every five minutes", () => {
    const crons = (vercelConfig as { crons: { path: string; schedule: string }[] }).crons;
    expect(crons.find((c) => c.path === "/api/cron/routine-reaper/")?.schedule).toBe("*/5 * * * *");
  });

  it("refuses a request without the cron bearer and reaps nothing", async () => {
    const res = await GET(request("Bearer wrong"));
    expect(res.status).toBe(401);
    expect(reap).not.toHaveBeenCalled();
  });

  it("reports the runs it marked died", async () => {
    reap.mockResolvedValue({ died: [{ id: "r1", routine_id: "/api/cron/coaching-cycle/", started_at: "2026-09-28T00:45:00Z" }], alerted: true });
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ died: 1, routines: ["/api/cron/coaching-cycle/"] });
  });

  it("fails the run when the reap itself failed", async () => {
    reap.mockResolvedValue({ error: "routine_runs reap: db down" });
    const res = await GET(request());
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "routine_runs reap: db down" });
  });

  it("fails the run when Operations did not get the alert", async () => {
    reap.mockResolvedValue({ died: [{ id: "r1", routine_id: "/api/cron/x/", started_at: "2026-09-28T00:45:00Z" }], alerted: false });
    const res = await GET(request());
    expect(res.status).toBe(500);
    // The lost alert is a named failure (Y.22); the reap's counters stay in the body.
    expect(await res.json()).toMatchObject({
      died: 1,
      error: "died-runs alert at alert Operations: Lark did not accept the died-runs alert (LARK_OPS_WEBHOOK_URL)",
    });
  });

  it("reports the effects it marked unknown (Z.1)", async () => {
    reap.mockResolvedValue({ died: [], alerted: true });
    markUnknown.mockResolvedValue({ unknown: [{ id: "e1", key: "ideas:nudge:p1:2026-W41", routine_id: "/api/cron/ideas-digest/" }], alerted: true });
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ died: 0, unknownEffects: 1 });
  });

  it("fails the run when the effect ledger could not be read, after reaping", async () => {
    reap.mockResolvedValue({ died: [], alerted: true });
    markUnknown.mockResolvedValue({ error: "automation_effects read: db down" });
    const res = await GET(request());
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "effect ledger at mark unknown: automation_effects read: db down" });
  });
});
