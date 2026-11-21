import { describe, expect, it, vi } from "vitest";
import { countDueMoves } from "./client-attention";

// AH.7.2: a client-visible card goes to Dave once its date has moved twice.
const row = (id: string, at: string, due: string | null) => ({ record_id: id, changed_at: at, due });

describe("countDueMoves", () => {
  it("counts each change to a different date, in the order they were made", () => {
    const m = countDueMoves([row("c", "2026-10-20", "2026-11-15"), row("c", "2026-10-01", "2026-10-15"), row("c", "2026-10-10", "2026-10-30")]);
    expect(m.get("c")).toBe(2);
  });

  it("does not count a first date, the same date saved again, or a row that clears the date", () => {
    const m = countDueMoves([
      row("c", "2026-10-01", "2026-10-15"),
      row("c", "2026-10-02", "2026-10-15"),
      row("c", "2026-10-04", null),
    ]);
    expect(m.get("c")).toBe(0);
  });
});

// The reads, against a fake that records every filter. The audit read is
// paged so no row is dropped past the API's row limit, and the blocker read
// names the one person it was asked about (boundary reviews, PR #2683).
const fake = vi.hoisted(() => ({ calls: [] as number[], size: 1000, filters: [] as [string, string, unknown][], selects: [] as string[], taskReads: 0 }));
vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const record = (op: string) => (col: string, val?: unknown) => (fake.filters.push([op, col, val]), chain);
      for (const k of ["eq", "in", "not", "is"]) chain[k] = record(k);
      chain.select = (cols: string) => (fake.selects.push(cols), chain);
      chain.order = () => chain;
      chain.range = async (from: number) => {
        fake.calls.push(from);
        // Two full pages of the same card's date going back and forth, then one row.
        const n = from < 2 * fake.size ? fake.size : 1;
        const data = Array.from({ length: n }, (_, i) => {
          const k = from + i;
          return { record_id: "c", changed_at: `2026-01-01T00:00:${String(k).padStart(6, "0")}`, due: k % 2 ? "2026-10-02" : "2026-10-01" };
        });
        return { data, error: null };
      };
      // tasks: the blockers first, then the cards they hold up.
      chain.then = (ok: (v: unknown) => unknown) => {
        const first = table === "tasks" && fake.taskReads++ === 0;
        const data = first
          ? [
              { id: "k1", title: "API key decision", status: "open", parent_task_id: "open-card", board_id: "b1" },
              { id: "k2", title: "Sign-off", status: "open", parent_task_id: "closed-card", board_id: "b1" },
              { id: "k3", title: "Done already", status: "done", parent_task_id: "open-card", board_id: "b1" },
            ]
          : [
              { id: "open-card", title: "SSO", status: "open" },
              { id: "closed-card", title: "Old", status: "done" },
            ];
        return Promise.resolve({ data, error: null }).then(ok);
      };
      return chain;
    },
  },
}));

describe("dueMovesOf", () => {
  it("reads every page, so a card with more rows than one page is counted in full", async () => {
    fake.filters = [];
    fake.selects = [];
    const { dueMovesOf } = await import("./client-attention");
    const m = await dueMovesOf(["c"]);
    expect(fake.calls).toEqual([0, 1000, 2000]);
    expect(m.get("c")).toBe(2000);
    // Only the date leaves the database, and only from rows that set one.
    expect(new Set(fake.selects)).toEqual(new Set(["record_id, changed_at, due:new_data->>due_date"]));
    expect(fake.filters).toContainEqual(["not", "new_data->>due_date", "is"]);
    expect(fake.filters).toContainEqual(["eq", "table_name", "tasks"]);
  });
});

describe("openBlockersOn", () => {
  it("asks only for blockers held by the person given, and keeps only open ones on open cards", async () => {
    fake.filters = [];
    fake.taskReads = 0;
    const { openBlockersOn } = await import("./client-attention");
    const out = await openBlockersOn("p1");
    expect(fake.filters).toContainEqual(["eq", "assignee_id", "p1"]);
    expect(fake.filters.filter(([, col]) => col === "assignee_id")).toHaveLength(1);
    expect(fake.filters).toContainEqual(["is", "archived_at", null]);
    expect(out).toEqual([{ id: "k1", boardId: "b1", cardTitle: "SSO", text: "API key decision" }]);
  });
});
