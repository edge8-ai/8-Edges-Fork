import { beforeEach, describe, expect, it, vi } from "vitest";

// The watchdog's kernel invariants (Z.15). Each is a read with an expected
// answer; these tests pin the answer each one gives for a given table state.

type Rows = { data: unknown[] | null; error: { message: string } | null };
const answers: Rows[] = [];
const filters: [string, unknown][][] = [];

function builder() {
  const seen: [string, unknown][] = [];
  filters.push(seen);
  const b: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(answers.shift() ?? { data: [], error: null }).then(resolve),
  };
  for (const op of ["select", "eq", "in", "is", "gte", "lte", "limit"]) {
    b[op] = (...args: unknown[]) => {
      seen.push([op, args]);
      return b;
    };
  }
  return b;
}

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: () => builder() } }));
vi.mock("@/vercel.json", () => ({
  default: {
    crons: [
      { path: "/api/cron/daily/", schedule: "0 1 * * *" },
      { path: "/api/cron/new/", schedule: "0 2 * * *" },
      { path: "/api/cron/self/", schedule: "30 23 * * *" },
    ],
  },
}));

const { errorRunsHaveAReason, lastSlots, routinesRanLastSlot, runInvariants } = await import("./invariants");

beforeEach(() => {
  answers.length = 0;
  filters.length = 0;
});

const NOW = new Date("2026-10-08T23:30:00Z");

describe("runInvariants", () => {
  it("reports a check that throws as broken, never as a pass", async () => {
    const results = await runInvariants([
      { id: "a", name: "fine", check: async () => ({ ok: true, detail: "fine" }) },
      { id: "b", name: "throws", check: async () => { throw new Error("db down"); } },
    ], NOW);
    expect(results).toEqual([
      { id: "a", name: "fine", ok: true, detail: "fine" },
      { id: "b", name: "throws", ok: false, detail: "could not check: db down" },
    ]);
  });
});

describe("lastSlots", () => {
  it("asks about the last slot that should have finished, not one still running", () => {
    const slots = lastSlots([{ path: "/x/", schedule: "25 23 * * *" }], NOW);
    // 23:25 today is five minutes old, inside the grace, so the slot asked about is yesterday's.
    expect(slots).toEqual([{ path: "/x/", tick: "2026-10-07" }]);
  });
});

describe("routinesRanLastSlot (Z.15.3)", () => {
  it("passes when every routine has a run for its last slot, leaving out its own path", async () => {
    answers.push({ data: [{ routine_id: "/api/cron/daily/", tick_key: "2026-10-08" }, { routine_id: "/api/cron/new/", tick_key: "2026-10-08" }], error: null });
    const r = await routinesRanLastSlot(["/api/cron/self/"]).check(NOW);
    expect(r.ok).toBe(true);
    expect(filters[0]).toContainEqual(["in", ["routine_id", ["/api/cron/daily/", "/api/cron/new/"]]]);
  });

  it("fails a routine that ran before and missed its slot, and only names one that never ran", async () => {
    answers.push({ data: [], error: null });
    answers.push({ data: [{ id: "old-run" }], error: null }); // daily ran before
    answers.push({ data: [], error: null }); // new never ran
    const r = await routinesRanLastSlot(["/api/cron/self/"]).check(NOW);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("/api/cron/daily/ (2026-10-08)");
    expect(r.detail).toContain("not run yet, new: /api/cron/new/");
  });

  it("is not fooled into passing when every missed routine is new", async () => {
    answers.push({ data: [], error: null });
    answers.push({ data: [], error: null });
    answers.push({ data: [], error: null });
    const r = await routinesRanLastSlot(["/api/cron/self/"]).check(NOW);
    expect(r.ok).toBe(true);
    expect(r.detail).toMatch(/^0 of 2 routines ran/);
  });

  it("throws on a failed read, so runInvariants reports it broken", async () => {
    answers.push({ data: null, error: { message: "timeout" } });
    await expect(routinesRanLastSlot().check(NOW)).rejects.toThrow("routine_runs: timeout");
  });
});

describe("errorRunsHaveAReason", () => {
  it("names the routines whose error runs carry no error", async () => {
    answers.push({ data: [{ routine_id: "/a/" }, { routine_id: "/a/" }, { routine_id: "/b/" }], error: null });
    const r = await errorRunsHaveAReason().check(NOW);
    expect(r).toEqual({ ok: false, detail: "3 error run(s) with no error text: /a/, /b/" });
  });

  it("passes when every error run has a reason", async () => {
    answers.push({ data: [], error: null });
    expect((await errorRunsHaveAReason().check(NOW)).ok).toBe(true);
  });
});
