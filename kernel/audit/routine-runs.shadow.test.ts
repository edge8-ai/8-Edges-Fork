import { beforeEach, describe, expect, it, vi } from "vitest";

// Z.17: shadow mode. A routine that declares shadow and is switched to it
// runs its work in a tick claimed as shadow, its effects go to the ledger as
// shadow records instead of happening, and the run's summary says shadow. A
// switch that cannot be read runs such a routine in shadow, never live; a
// routine that cannot honour shadow is skipped when set to it, and runs live
// on a failed read as before (Y.7).

const db = vi.hoisted(() => ({
  config: { data: null as unknown, error: null as { message: string } | null },
  configThrows: false,
  claims: [] as Record<string, unknown>[],
  closes: [] as Record<string, unknown>[],
  liveKey: { data: null as unknown, error: null as { message: string } | null },
  upserts: [] as { row: Record<string, unknown>; opts: unknown }[],
  upserted: { data: [{ id: "s1" }] as unknown[] | null, error: null as { message: string } | null },
  rpcCalls: [] as string[],
  // The other mode's runs of the same tick (the cross-mode check).
  otherMode: { data: [] as unknown[] | null, error: null as { message: string } | null },
  otherModeFilters: [] as [string, unknown][],
}));

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      db.rpcCalls.push(fn);
      if (fn === "claim_tick") {
        db.claims.push(args);
        return { data: `run-${db.claims.length}`, error: null };
      }
      // claim_effect: a live claim, which a shadow run must never make.
      return { data: [{ id: "e1", attempt: 1 }], error: null };
    },
    from: (table: string) => {
      if (table === "routine_config") {
        if (db.configThrows) throw new Error("socket hang up");
        const b: Record<string, unknown> = { maybeSingle: async () => db.config };
        b.select = () => b;
        b.eq = () => b;
        return b;
      }
      if (table === "automation_effects") {
        const read: Record<string, unknown> = { maybeSingle: async () => db.liveKey };
        read.eq = () => read;
        return {
          select: () => read,
          upsert: (row: Record<string, unknown>, opts: unknown) => {
            db.upserts.push({ row, opts });
            return { select: async () => db.upserted };
          },
          update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
        };
      }
      // routine_runs: the cross-mode check, and the fenced close.
      return {
        select: () => {
          const q: Record<string, unknown> = {
            eq: (c: string, v: unknown) => (db.otherModeFilters.push([c, v]), q),
            in: () => q,
            limit: async () => db.otherMode,
          };
          return q;
        },
        update: (patch: Record<string, unknown>) => {
          db.closes.push(patch);
          const chain: Record<string, unknown> = { eq: () => chain, in: () => chain, select: async () => ({ data: [{ id: "run-1" }], error: null }) };
          return chain;
        },
      };
    },
  },
}));
vi.mock("@/kernel/messaging/lark", () => ({ notifyOps: vi.fn(async () => true) }));
// One routine declares shadow in its automation block; the real registry has none yet.
vi.mock("@/kernel/audit/automations.json", () => ({ default: [{ path: "/api/cron/chain/", shadow: true }, { path: "/api/cron/plain/" }] }));

const { withRoutineRun, recordRoutineRun, currentRunMode } = await import("@/kernel/audit/routine-runs");
const { once } = await import("@/kernel/audit/effects");

const SECRET = "test-cron-secret";
const req = (path: string) => new Request(`https://example.test${path}`, { headers: { authorization: `Bearer ${SECRET}` } });

// A routine's work: one Lark post through the ledger, reporting what it saw.
function work(seen: { mode?: string; acted?: boolean; reason?: string }, act: () => Promise<{ ok: true }>) {
  return vi.fn(async () => {
    seen.mode = currentRunMode();
    const r = await once("crm:followup-ready:m1", "lark", act, { summary: "Lark DM to the revenue approver: follow-up for Acme ready", detail: { meeting: "m1" } });
    seen.acted = r.acted;
    if (!r.acted) seen.reason = r.reason;
    return Response.json({ drafted: 1 });
  });
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  db.config = { data: null, error: null };
  db.configThrows = false;
  db.claims.length = 0;
  db.closes.length = 0;
  db.liveKey = { data: null, error: null };
  db.upserts.length = 0;
  db.upserted = { data: [{ id: "s1" }], error: null };
  db.rpcCalls.length = 0;
  db.otherMode = { data: [], error: null };
  db.otherModeFilters.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("a scheduled tick in shadow (Z.17)", () => {
  it("runs the work in a shadow tick, records the effect instead of acting, and says shadow in the summary", async () => {
    db.config = { data: { mode: "shadow", paused_reason: null }, error: null };
    const act = vi.fn(async () => ({ ok: true as const }));
    const seen: { mode?: string; acted?: boolean; reason?: string } = {};
    const handler = work(seen, act);
    await withRoutineRun("/api/cron/chain/", req("/api/cron/chain/"), handler);

    expect(handler).toHaveBeenCalledOnce();
    expect(db.claims[0]).toMatchObject({ p_routine: "/api/cron/chain/", p_mode: "shadow" });
    expect(seen).toEqual({ mode: "shadow", acted: false, reason: "shadow: recorded crm:followup-ready:m1; nothing was sent" });
    expect(act).not.toHaveBeenCalled();
    expect(db.rpcCalls).not.toContain("claim_effect");
    expect(db.upserts).toEqual([
      {
        row: {
          key: "shadow:crm:followup-ready:m1",
          routine_id: "/api/cron/chain/",
          run_id: "run-1",
          kind: "lark",
          status: "shadow",
          summary: "Lark DM to the revenue approver: follow-up for Acme ready",
          detail: { meeting: "m1" },
        },
        opts: { onConflict: "key", ignoreDuplicates: true },
      },
    ]);
    expect(db.closes.at(-1)).toMatchObject({ status: "ok", summary: "shadow: drafted 1" });
  });

  it("writes what the kernel's senders held back into the run's log and summary", async () => {
    db.config = { data: { mode: "shadow", paused_reason: null }, error: null };
    const { heldInShadow } = await import("@/kernel/audit/run-context");
    await withRoutineRun("/api/cron/chain/", req("/api/cron/chain/"), async () => {
      heldInShadow("email", "a transactional email to 1 recipient");
      heldInShadow("lark-dm", "a text DM (workboard)");
      return Response.json({ drafted: 1 });
    });
    expect(db.closes.at(-1)).toMatchObject({
      summary: "shadow (held back 2 sends): drafted 1",
      log: "held back email: a transactional email to 1 recipient\nheld back lark-dm: a text DM (workboard)",
    });
  });

  it("runs live, and acts, when the same routine is live", async () => {
    db.config = { data: { mode: "live", paused_reason: null }, error: null };
    const act = vi.fn(async () => ({ ok: true as const }));
    const seen: { mode?: string; acted?: boolean } = {};
    await withRoutineRun("/api/cron/chain/", req("/api/cron/chain/"), work(seen, act));
    expect(db.claims[0]).toMatchObject({ p_mode: "live" });
    expect(seen).toMatchObject({ mode: "live", acted: true });
    expect(act).toHaveBeenCalledOnce();
    expect(db.upserts).toEqual([]);
    expect(db.closes.at(-1)).toMatchObject({ summary: "drafted 1" });
  });

  it("skips a routine set to shadow that does not declare it, rather than letting it send", async () => {
    db.config = { data: { mode: "shadow", paused_reason: null }, error: null };
    const handler = vi.fn(async () => Response.json({ status: "ok" }));
    const res = await withRoutineRun("/api/cron/plain/", req("/api/cron/plain/"), handler);
    expect(handler).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({ status: "skipped", reason: "set to shadow, which this routine does not support; nothing was run" });
    expect(db.claims[0]).toMatchObject({ p_mode: "live" });
  });
});

describe("a switch that cannot be read (Z.17)", () => {
  it("skips a shadow-capable routine's tick: neither live nor shadow is safe to guess", async () => {
    for (const fail of [() => (db.config = { data: null, error: { message: "timeout" } }), () => (db.configThrows = true)]) {
      db.configThrows = false;
      db.claims.length = 0;
      fail();
      const handler = vi.fn(async () => Response.json({ status: "ok" }));
      const res = await withRoutineRun("/api/cron/chain/", req("/api/cron/chain/"), handler);
      expect(handler).not.toHaveBeenCalled();
      await expect(res.json()).resolves.toEqual({ status: "skipped", reason: "the switch could not be read" });
      expect(db.closes.at(-1)).toMatchObject({ status: "skipped", summary: "the switch could not be read" });
      expect(db.upserts).toEqual([]);
    }
  });

  it("runs a routine that cannot honour shadow live, as before (Y.7)", async () => {
    db.config = { data: null, error: { message: "timeout" } };
    const handler = vi.fn(async () => Response.json({ status: "ok" }));
    await withRoutineRun("/api/cron/plain/", req("/api/cron/plain/"), handler);
    expect(handler).toHaveBeenCalledOnce();
    expect(db.claims[0]).toMatchObject({ p_mode: "live" });
  });
});

describe("one tick, one run, across modes (Z.17)", () => {
  it("stands down when the other mode holds a run of the same tick, freeing its own claim", async () => {
    db.config = { data: { mode: "shadow", paused_reason: null }, error: null };
    db.otherMode = { data: [{ id: "live-run" }], error: null };
    const handler = vi.fn(async () => Response.json({ status: "ok" }));
    const res = await recordRoutineRun("/api/cron/chain/", handler, "vercel", { tick: "c1:e1:draft", honourPause: true });
    expect(handler).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toMatchObject({ status: "skipped", reason: "tick-taken", detail: "a live run holds this tick" });
    expect(db.otherModeFilters).toEqual(expect.arrayContaining([["tick_key", "c1:e1:draft"], ["mode", "live"]]));
    // Closed as skipped without its tick, so it neither keeps the tick nor counts as a failure.
    expect(db.closes.at(-1)).toMatchObject({ status: "skipped", tick_key: null, summary: "a live run holds this tick" });
  });

  it("stands down when the other mode cannot be checked", async () => {
    db.config = { data: { mode: "live", paused_reason: null }, error: null };
    db.otherMode = { data: null, error: { message: "timeout" } };
    const handler = vi.fn(async () => Response.json({ status: "ok" }));
    await recordRoutineRun("/api/cron/chain/", handler, "vercel", { tick: "c1:e1:draft" });
    expect(handler).not.toHaveBeenCalled();
    expect(db.closes.at(-1)).toMatchObject({ tick_key: null, summary: "the shadow run of this tick could not be checked (timeout)" });
  });

  it("runs when the other mode holds nothing", async () => {
    db.config = { data: { mode: "shadow", paused_reason: null }, error: null };
    const handler = vi.fn(async () => Response.json({ status: "ok" }));
    await recordRoutineRun("/api/cron/chain/", handler, "vercel", { tick: "c1:e1:draft" });
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe("a person's button (Run now)", () => {
  it("runs a shadow routine in shadow, and a paused one live, as it always has", async () => {
    db.config = { data: { mode: "shadow", paused_reason: null }, error: null };
    const act = vi.fn(async () => ({ ok: true as const }));
    const seen: { mode?: string } = {};
    await recordRoutineRun("/api/cron/chain/", work(seen, act));
    expect(seen.mode).toBe("shadow");
    expect(act).not.toHaveBeenCalled();

    db.config = { data: { mode: "paused", paused_reason: "held" }, error: null };
    const seen2: { mode?: string } = {};
    await recordRoutineRun("/api/cron/chain/", work(seen2, act));
    expect(seen2.mode).toBe("live");
    expect(act).toHaveBeenCalledOnce();
  });

  it("refuses to run a routine set to shadow that does not declare it, rather than run it live", async () => {
    db.config = { data: { mode: "shadow", paused_reason: null }, error: null };
    const handler = vi.fn(async () => Response.json({ status: "ok" }));
    const res = await recordRoutineRun("/api/cron/plain/", handler);
    expect(handler).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({ status: "skipped", reason: "set to shadow, which this routine does not support; nothing was run" });
  });
});

describe("a run started inside a shadow run", () => {
  it("stays in shadow when it can, and is skipped when it cannot, whatever its own switch says", async () => {
    db.config = { data: { mode: "shadow", paused_reason: null }, error: null };
    const child: { capable?: string; plain?: unknown; plainRan?: boolean } = {};
    await withRoutineRun("/api/cron/chain/", req("/api/cron/chain/"), async () => {
      // The children's own switch says live.
      db.config = { data: { mode: "live", paused_reason: null }, error: null };
      await recordRoutineRun("/api/cron/chain/", async () => {
        child.capable = currentRunMode();
        return Response.json({ ok: true });
      });
      const res = await recordRoutineRun("/background/plain/", async () => {
        child.plainRan = true;
        return Response.json({ ok: true });
      });
      child.plain = await res.json();
      return Response.json({ drafted: 1 });
    });
    expect(child.capable).toBe("shadow");
    expect(db.claims.map((c) => c.p_mode)).toEqual(["shadow", "shadow", "live"]);
    expect(child.plainRan).toBeUndefined();
    expect(child.plain).toEqual({ status: "skipped", reason: "started inside a shadow run, and this routine does not support shadow" });
  });

  it("leaves a run started inside a live run to its own switch", async () => {
    db.config = { data: { mode: "live", paused_reason: null }, error: null };
    let ran = false;
    await withRoutineRun("/api/cron/chain/", req("/api/cron/chain/"), async () => {
      await recordRoutineRun("/background/plain/", async () => ((ran = true), Response.json({ ok: true })));
      return Response.json({ ok: true });
    });
    expect(ran).toBe(true);
  });
});

describe("once in a shadow run", () => {
  async function shadowRun() {
    db.config = { data: { mode: "shadow", paused_reason: null }, error: null };
    const act = vi.fn(async () => ({ ok: true as const }));
    const seen: { mode?: string; acted?: boolean; reason?: string } = {};
    await withRoutineRun("/api/cron/chain/", req("/api/cron/chain/"), work(seen, act));
    return { act, seen };
  }

  it("records nothing for an effect a live run would not have made either", async () => {
    db.liveKey = { data: { status: "done" }, error: null };
    const { act, seen } = await shadowRun();
    expect(seen).toMatchObject({ acted: false, reason: "crm:followup-ready:m1 is already claimed or done; nothing to record in shadow" });
    expect(db.upserts).toEqual([]);
    expect(act).not.toHaveBeenCalled();
  });

  it("keeps the first record when the same effect comes round again", async () => {
    db.upserted = { data: [], error: null };
    const { act, seen } = await shadowRun();
    expect(seen.reason).toBe("crm:followup-ready:m1 is already recorded in shadow");
    expect(act).not.toHaveBeenCalled();
  });

  it("sends nothing when the record itself fails, or the live key cannot be read", async () => {
    db.liveKey = { data: null, error: { message: "timeout" } };
    db.upserted = { data: null, error: { message: "db down" } };
    const { act, seen } = await shadowRun();
    expect(db.upserts).toHaveLength(1);
    expect(seen).toMatchObject({ acted: false, reason: "shadow: crm:followup-ready:m1 could not be recorded (db down); nothing was sent" });
    expect(act).not.toHaveBeenCalled();
  });
});

describe("once outside shadow", () => {
  it("refuses a caller's key in the shadow namespace without acting or claiming", async () => {
    const act = vi.fn(async () => ({ ok: true as const }));
    const r = await once("shadow:crm:x", "lark", act);
    expect(r).toMatchObject({ acted: false });
    expect(act).not.toHaveBeenCalled();
    expect(db.rpcCalls).toEqual([]);
    expect(db.upserts).toEqual([]);
  });
});
