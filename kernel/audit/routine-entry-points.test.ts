import { beforeEach, describe, expect, it, vi } from "vitest";

// Y.25: Run now runs a scheduled routine's own handler in-process, through
// the composition root's registry. The run goes through the routine's own
// withRoutineRun: it claims a fresh tick (never the schedule's slot), needs no
// cron bearer because it is inside runByHand, and runs even when the routine
// is off, as any button does. Outside runByHand nothing changes: no bearer is
// a 401, and a paused routine records a skipped run.

const db = vi.hoisted(() => ({
  config: { data: null as unknown, error: null },
  claims: [] as Record<string, unknown>[],
  closes: [] as Record<string, unknown>[],
}));

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    rpc: async (_fn: string, args: Record<string, unknown>) => (db.claims.push(args), { data: `run-${db.claims.length}`, error: null }),
    from: (table: string) => {
      if (table === "routine_config") {
        const b: Record<string, unknown> = { maybeSingle: async () => db.config };
        b.select = () => b;
        b.eq = () => b;
        return b;
      }
      return {
        update: (row: Record<string, unknown>) => {
          db.closes.push(row);
          const chain: Record<string, unknown> = { eq: () => chain, in: () => chain, select: async () => ({ data: [{ id: "run" }], error: null }) };
          return chain;
        },
      };
    },
  },
}));
vi.mock("@/kernel/messaging/lark", () => ({ notifyOps: vi.fn(async () => true) }));
vi.mock("@/vercel.json", () => ({ default: { crons: [{ path: "/api/cron/thing/", schedule: "0 23 * * 2" }] } }));

const { withRoutineRun } = await import("./routine-runs");
const { registerRoutineEntryPoints, runRoutineByHand, hasRoutineEntryPoint } = await import("./routine-entry-points");

const handler = vi.fn(async () => Response.json({ status: "ok", posted: 3 }));
const GET = (req: Request) => withRoutineRun("/api/cron/thing/", req, handler);

beforeEach(() => {
  db.config = { data: null, error: null };
  db.claims.length = 0;
  db.closes.length = 0;
  handler.mockClear();
  process.env.CRON_SECRET = "test-cron-secret";
  registerRoutineEntryPoints({ "/api/cron/thing/": async () => GET });
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("runRoutineByHand", () => {
  it("runs the routine's own handler in-process, in a fresh tick, without the cron bearer", async () => {
    const res = await runRoutineByHand("/api/cron/thing/", "ana@example.test");
    expect(handler).toHaveBeenCalledOnce();
    expect(res).toEqual({ ok: true, status: "ok", summary: "posted 3" });
    // The claim is withRoutineRun's own; its tick is a UUID, not the weekly slot "2026-W41".
    expect(db.claims).toHaveLength(1);
    expect(db.claims[0]).toMatchObject({ p_routine: "/api/cron/thing/", p_mode: "live" });
    expect(String(db.claims[0].p_tick)).toMatch(/^[0-9a-f-]{36}$/);
    // Who pressed it is on the row from the claim, before the work runs.
    expect(db.closes[0]).toEqual({ log: "Run now by ana@example.test" });
    expect(db.closes[1]).toMatchObject({ status: "ok" });
  });

  it("runs a routine that is off: the pause stops the schedule, not a person", async () => {
    db.config = { data: { mode: "paused", paused_reason: "waiting on the redesign" }, error: null };
    const res = await runRoutineByHand("/api/cron/thing/", "ana@example.test");
    expect(handler).toHaveBeenCalledOnce();
    expect(res).toMatchObject({ ok: true, status: "ok" });
  });

  it("says what the run said when it failed or skipped", async () => {
    handler.mockResolvedValueOnce(Response.json({ error: "Lark refused the post" }, { status: 500 }));
    expect(await runRoutineByHand("/api/cron/thing/", "k")).toEqual({ ok: true, status: "error", summary: "Lark refused the post" });
    handler.mockResolvedValueOnce(Response.json({ status: "skipped", reason: "not its day" }));
    expect(await runRoutineByHand("/api/cron/thing/", "k")).toEqual({ ok: true, status: "skipped", summary: "not its day" });
  });

  it("refuses a routine with no registered handler, and says when nothing was registered", async () => {
    expect(await runRoutineByHand("/api/cron/other/", "k")).toMatchObject({ ok: false });
    expect(hasRoutineEntryPoint("/api/cron/other/")).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it("gives a run by hand the page's 300 s deadline, whatever shorter step its route declares", async () => {
    // weekly-sprints and seven others pass stepSeconds: 60 for their own
    // route; under Run now they run inside the agents page's 300 s action, and
    // a 60 s deadline would have the reaper mark them died while they still run.
    const SHORT = (req: Request) => withRoutineRun("/api/cron/thing/", req, handler, "vercel", { stepSeconds: 60 });
    registerRoutineEntryPoints({ "/api/cron/thing/": async () => SHORT });
    await runRoutineByHand("/api/cron/thing/", "ana@example.test");
    expect(db.claims[0]).toMatchObject({ p_step_s: 300 });
    // The schedule's own call keeps the route's deadline.
    await SHORT(new Request("https://example.test/api/cron/thing/", { headers: { authorization: "Bearer test-cron-secret" } }));
    expect(db.claims[1]).toMatchObject({ p_step_s: 60 });
    // And it writes no "Run now by" line.
    expect(db.closes.filter((c) => "log" in c && !("status" in c))).toHaveLength(1);
  });

  it("finds the registry from a second copy of the module, as Next's layers each load their own", async () => {
    vi.resetModules();
    const second = await import("./routine-entry-points");
    expect(second.hasRoutineEntryPoint("/api/cron/thing/")).toBe(true);
  });
});

describe("the schedule's entry point, outside Run now", () => {
  it("still refuses a call without the bearer", async () => {
    const res = await GET(new Request("https://example.test/api/cron/thing/"));
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("still honours the pause for a call with the bearer", async () => {
    db.config = { data: { mode: "paused", paused_reason: "bank holiday" }, error: null };
    const res = await GET(new Request("https://example.test/api/cron/thing/", { headers: { authorization: "Bearer test-cron-secret" } }));
    expect(handler).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({ status: "skipped", reason: "paused: bank holiday" });
  });
});
