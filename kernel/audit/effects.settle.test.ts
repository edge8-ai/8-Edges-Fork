import { beforeEach, describe, expect, it, vi } from "vitest";

// Y.25: a person's answer to an unknown effect, the runbook's resolution as a
// click. It is fenced to a row still unknown, so a second answer, or one to a
// row the ledger already settled, changes nothing and says so. The page's
// read takes this week's effects and every unknown one, however old.

const db = vi.hoisted(() => ({
  updates: [] as { patch: Record<string, unknown>; filters: [string, unknown][] }[],
  updated: { data: [{ key: "ideas:nudge:p1:2026-W41", routine_id: "/api/cron/ideas-digest/" }] as unknown[], error: null as { message: string } | null },
  orFilter: "" as string,
}));

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        const entry = { patch, filters: [] as [string, unknown][] };
        db.updates.push(entry);
        const chain: Record<string, unknown> = {
          eq: (c: string, v: unknown) => (entry.filters.push([c, v]), chain),
          select: async () => db.updated,
        };
        return chain;
      },
      select: () => {
        const chain: Record<string, unknown> = {
          or: (f: string) => ((db.orFilter = f), chain),
          order: () => chain,
          limit: async () => ({ data: [], error: null }),
        };
        return chain;
      },
    }),
  },
}));
vi.mock("@/kernel/messaging/lark", () => ({ notifyOps: vi.fn(async () => true) }));
vi.mock("./routine-runs", () => ({ currentRoutineId: () => null, currentRunId: () => null }));

const { settleUnknownEffect, effectsSince } = await import("./effects");

beforeEach(() => {
  db.updates.length = 0;
  db.updated = { data: [{ key: "ideas:nudge:p1:2026-W41", routine_id: "/api/cron/ideas-digest/" }], error: null };
});

describe("settleUnknownEffect", () => {
  it("marks a send that happened done, fenced to a row still unknown", async () => {
    const r = await settleUnknownEffect("e1", "done");
    expect(r).toEqual({ ok: true, key: "ideas:nudge:p1:2026-W41", routineId: "/api/cron/ideas-digest/" });
    expect(db.updates[0].patch).toMatchObject({ status: "done" });
    expect(db.updates[0].patch.done_at).toEqual(expect.any(String));
    expect(db.updates[0].filters).toEqual([["id", "e1"], ["status", "unknown"]]);
  });

  it("releases a send that did not happen, so the next run claims its key afresh", async () => {
    await settleUnknownEffect("e1", "released");
    expect(db.updates[0].patch).toMatchObject({ status: "released" });
    expect(db.updates[0].patch.done_at).toBeUndefined();
  });

  it("says so when the row was no longer unknown", async () => {
    db.updated = { data: [], error: null };
    expect(await settleUnknownEffect("e1", "done")).toMatchObject({ ok: false });
  });
});

describe("effectsSince", () => {
  it("reads the week's effects and every unknown one", async () => {
    await effectsSince(new Date("2026-10-05T17:00:00Z"));
    expect(db.orFilter).toBe("claimed_at.gte.2026-10-05T17:00:00.000Z,status.eq.unknown");
  });
});
