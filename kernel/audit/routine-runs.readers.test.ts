import { beforeEach, describe, expect, it, vi } from "vitest";

// The Settings -> Agents readers. The routine reaper runs every five minutes,
// so a read of "the latest N rows" would soon hold nothing but reaper runs
// and show a weekly routine as never run. Each routine's latest run is read
// on its own, and the token read looks only at runs that made model calls.

type Row = { id: string; routine_id: string; started_at: string; status: string; ai_calls: number; ai_input_tokens: number; ai_output_tokens: number };
let table: Row[] = [];

// A faithful enough PostgREST: filters, then order, then limit.
function selectChain() {
  const filters: ((r: Row) => boolean)[] = [];
  let order: { col: keyof Row; ascending: boolean } | null = null;
  const run = (n?: number) => {
    let out = table.filter((r) => filters.every((f) => f(r)));
    if (order) {
      const { col, ascending } = order;
      out = [...out].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (ascending ? 1 : -1));
    }
    return { data: n === undefined ? out : out.slice(0, n), error: null };
  };
  const chain = {
    eq(col: keyof Row, v: unknown) {
      filters.push((r) => r[col] === v);
      return chain;
    },
    gt(col: keyof Row, v: number) {
      filters.push((r) => (r[col] as number) > v);
      return chain;
    },
    gte(col: keyof Row, v: string) {
      filters.push((r) => (r[col] as string) >= v);
      return chain;
    },
    order(col: keyof Row, opts: { ascending: boolean }) {
      order = { col, ascending: opts.ascending };
      return chain;
    },
    limit: async (n: number) => run(n),
  };
  return chain;
}

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: () => ({ select: () => selectChain() }) },
}));
vi.mock("@/kernel/messaging/lark", () => ({ notifyOps: async () => true }));

const { recentRunsByRoutine, aiTokensByRoutine } = await import("@/kernel/audit/routine-runs");

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

beforeEach(() => {
  table = [];
});

describe("recentRunsByRoutine", () => {
  it("finds a routine's newest runs however many runs other routines wrote since", async () => {
    table.push({ id: "weekly-old", routine_id: "/api/cron/qbo-refresh/", started_at: ago(13 * 1440), status: "error", ai_calls: 0, ai_input_tokens: 0, ai_output_tokens: 0 });
    table.push({ id: "weekly", routine_id: "/api/cron/qbo-refresh/", started_at: ago(6 * 1440), status: "ok", ai_calls: 0, ai_input_tokens: 0, ai_output_tokens: 0 });
    for (let i = 0; i < 3000; i++) {
      table.push({ id: `reap-${i}`, routine_id: "/api/cron/routine-reaper/", started_at: ago(i * 2), status: "ok", ai_calls: 0, ai_input_tokens: 0, ai_output_tokens: 0 });
    }
    const recent = await recentRunsByRoutine(["/api/cron/qbo-refresh/", "/api/cron/routine-reaper/", "/api/cron/never/"], 3);
    // Newest first, so "failed twice in a row" reads the first two.
    expect(recent.get("/api/cron/qbo-refresh/")?.map((r) => r.id)).toEqual(["weekly", "weekly-old"]);
    expect(recent.get("/api/cron/routine-reaper/")?.map((r) => r.id)).toEqual(["reap-0", "reap-1", "reap-2"]);
    expect(recent.has("/api/cron/never/")).toBe(false);
  });
});

describe("aiTokensByRoutine", () => {
  it("sums the runs that made model calls, however many runs made none", async () => {
    for (let i = 0; i < 6000; i++) {
      table.push({ id: `reap-${i}`, routine_id: "/api/cron/routine-reaper/", started_at: ago(i), status: "ok", ai_calls: 0, ai_input_tokens: 0, ai_output_tokens: 0 });
    }
    table.push({ id: "ai", routine_id: "/api/cron/coaching-recaps/", started_at: ago(7000), status: "ok", ai_calls: 2, ai_input_tokens: 100, ai_output_tokens: 40 });
    const spend = await aiTokensByRoutine(30);
    expect(spend.get("/api/cron/coaching-recaps/")).toEqual({ calls: 2, input: 100, output: 40 });
  });
});
