import { beforeEach, describe, expect, it, vi } from "vitest";

// Z.1: the effect ledger. `once` acts only on a fresh claim and settles the
// claim with what the act did; the reaper's half marks a claim whose run is
// over as unknown and tells Operations. The database is scripted here; the
// claim_effect function itself was proven on production in a rolled-back
// transaction (PR #1975).

const db = vi.hoisted(() => ({
  claim: { data: [{ id: "e1", attempt: 1 }] as unknown, error: null as { message: string } | null },
  stale: [] as unknown[],
  updates: [] as { patch: Record<string, unknown>; filters: [string, unknown][] }[],
  rpcArgs: [] as Record<string, unknown>[],
}));

function updateChain(patch: Record<string, unknown>) {
  const entry = { patch, filters: [] as [string, unknown][] };
  db.updates.push(entry);
  const chain: Record<string, unknown> = {
    eq: (col: string, v: unknown) => (entry.filters.push([col, v]), chain),
    in: (col: string, v: unknown) => (entry.filters.push([col, v]), chain),
    select: async () => ({ data: (entry.filters.find(([c]) => c === "id")?.[1] as string[]).map((id) => ({ id, key: `k-${id}`, routine_id: "/api/cron/x/" })), error: null }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
  };
  return chain;
}

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    rpc: async (_fn: string, args: Record<string, unknown>) => (db.rpcArgs.push(args), db.claim),
    from: () => ({
      update: (patch: Record<string, unknown>) => updateChain(patch),
      select: () => ({ eq: () => ({ lt: () => ({ limit: async () => ({ data: db.stale, error: null }) }) }) }),
    }),
  },
}));
const ops = vi.hoisted(() => ({ messages: [] as string[] }));
vi.mock("@/kernel/messaging/lark", () => ({ notifyOps: vi.fn(async (m: string) => (ops.messages.push(m), true)) }));
// A live run; the shadow half of once is tested in routine-runs.shadow.test.ts.
vi.mock("./routine-runs", () => ({ currentRoutineId: () => "/api/cron/ideas-digest/", currentRunId: () => "run-9", currentRunMode: () => "live" }));

const { once, markUnknownEffects } = await import("./effects");

beforeEach(() => {
  db.claim = { data: [{ id: "e1", attempt: 1 }], error: null };
  db.stale = [];
  db.updates.length = 0;
  db.rpcArgs.length = 0;
  ops.messages.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("once", () => {
  it("acts on a fresh claim and marks it done with the provider's reference", async () => {
    const act = vi.fn(async () => ({ ok: true as const, ref: "om_1" }));
    const r = await once("ideas:nudge:p1:2026-W41", "lark", act);
    expect(act).toHaveBeenCalledOnce();
    expect(r).toEqual({ acted: true, outcome: { ok: true, ref: "om_1" }, attempt: 1 });
    expect(db.rpcArgs[0]).toEqual({ p_key: "ideas:nudge:p1:2026-W41", p_routine: "/api/cron/ideas-digest/", p_run: "run-9", p_kind: "lark" });
    expect(db.updates[0].patch).toMatchObject({ status: "done", provider_ref: "om_1" });
    // Fenced to a claim still open, so the reaper's unknown mark is never overwritten.
    expect(db.updates[0].filters).toEqual([["id", "e1"], ["status", "claimed"]]);
  });

  it("does not act on a key already claimed or done", async () => {
    db.claim = { data: [], error: null };
    const act = vi.fn(async () => ({ ok: true as const }));
    const r = await once("ideas:nudge:p1:2026-W41", "lark", act);
    expect(act).not.toHaveBeenCalled();
    expect(r).toMatchObject({ acted: false });
    expect(db.updates).toEqual([]);
  });

  it("releases the claim when the act failed or threw, so a retry may claim it", async () => {
    await once("k1", "lark", async () => ({ ok: false, error: "Lark said no" }));
    await once("k2", "lark", async () => {
      throw new Error("socket hang up");
    });
    expect(db.updates.map((u) => u.patch)).toEqual([
      { status: "released", detail: { error: "Lark said no" } },
      { status: "released", detail: { error: "socket hang up" } },
    ]);
  });

  it("acts anyway when the ledger cannot be reached, and settles nothing", async () => {
    db.claim = { data: null, error: { message: "db down" } };
    const act = vi.fn(async () => ({ ok: true as const }));
    const r = await once("k", "publish", act);
    expect(act).toHaveBeenCalledOnce();
    expect(r).toEqual({ acted: true, outcome: { ok: true }, attempt: null });
    expect(db.updates).toEqual([]);
  });
});

describe("markUnknownEffects", () => {
  it("marks a claim whose run is over, or has no run, as unknown and tells Operations", async () => {
    db.stale = [
      { id: "e1", key: "k-e1", routine_id: "/api/cron/x/", run: { status: "died" } },
      { id: "e2", key: "k-e2", routine_id: "/api/cron/x/", run: null },
      { id: "e3", key: "k-e3", routine_id: "/api/cron/x/", run: { status: "running" } },
      { id: "e4", key: "k-e4", routine_id: "/api/cron/x/", run: [{ status: "waiting" }] },
    ];
    const r = await markUnknownEffects(new Date("2026-10-09T12:00:00Z"));
    expect(r).toMatchObject({ unknown: [{ id: "e1" }, { id: "e2" }], alerted: true });
    expect(db.updates[0].patch).toEqual({ status: "unknown" });
    expect(db.updates[0].filters).toEqual([["id", ["e1", "e2"]], ["status", "claimed"]]);
    expect(ops.messages[0]).toMatch(/2 automated effects may or may not have happened/);
  });

  it("does nothing and says nothing when every old claim's run is still live", async () => {
    db.stale = [{ id: "e3", key: "k", routine_id: "/api/cron/x/", run: { status: "running" } }];
    expect(await markUnknownEffects()).toEqual({ unknown: [], alerted: true });
    expect(db.updates).toEqual([]);
    expect(ops.messages).toEqual([]);
  });
});
