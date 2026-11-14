import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// withRoutineRun is the single bearer gate for every cron entry point: the four
// htt handlers and the fourteen others each carried a byte-identical copy of
// the check, which is how one of them ends up missing it. These tests pin the
// two halves of the contract the copies used to provide — an unauthenticated
// request gets exactly the 401 body the handlers returned and never reaches the
// handler, and it records no routine_runs row.

const inserted: unknown[] = [];

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    from: () => ({
      insert: (row: unknown) => {
        inserted.push(row);
        return { select: () => ({ single: async () => ({ data: { id: "run-1" }, error: null }) }) };
      },
    }),
  },
}));

const { withRoutineRun } = await import("@/kernel/audit/routine-runs");

const SECRET = "test-cron-secret";

function request(authorization?: string): Request {
  return new Request("https://example.test/api/cron/thing", {
    headers: authorization ? { authorization } : {},
  });
}

describe("withRoutineRun bearer gate", () => {
  const previous = process.env.CRON_SECRET;

  beforeEach(() => {
    inserted.length = 0;
    process.env.CRON_SECRET = SECRET;
  });

  afterEach(() => {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
    vi.restoreAllMocks();
  });

  it("401s a request with no authorization header, runs no handler and records no run", async () => {
    const handler = vi.fn();
    const res = await withRoutineRun("/api/cron/thing/", request(), handler);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(handler).not.toHaveBeenCalled();
    expect(inserted).toEqual([]);
  });

  it("401s a wrong bearer and records no run", async () => {
    const handler = vi.fn();
    const res = await withRoutineRun("/api/cron/thing/", request("Bearer wrong"), handler);

    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    expect(inserted).toEqual([]);
  });

  it("401s every request when CRON_SECRET is unset, as the local copies did", async () => {
    delete process.env.CRON_SECRET;
    const handler = vi.fn();
    const res = await withRoutineRun("/api/cron/thing/", request(`Bearer ${SECRET}`), handler);

    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    expect(inserted).toEqual([]);
  });

  it("runs the handler on a correct bearer and records the run", async () => {
    const handler = vi.fn(async () => Response.json({ ok: true, sent: 2 }));
    const res = await withRoutineRun("/api/cron/thing/", request(`Bearer ${SECRET}`), handler);

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ routine_id: "/api/cron/thing/", status: "ok", summary: "ok true, sent 2" });
  });
});
