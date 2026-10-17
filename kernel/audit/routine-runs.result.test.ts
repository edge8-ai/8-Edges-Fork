import { beforeEach, describe, expect, it, vi } from "vitest";

// The typed run result (Y.13, plan decision Y.80): a routine says what
// happened and the kernel decides what that makes the run. These tests pin the
// rule and prove the recorder writes the judged status and error, which is the
// step customer-status (#1875) and four crons (Y.88) each had to remember.

const inserted: Record<string, unknown>[] = [];

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    // No rpc: the tick claim fails and the run is written as one closed row
    // at the end, which is the row these tests read.
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserted.push(row);
        return { select: () => ({ single: async () => ({ data: { id: "run-1" }, error: null }) }) };
      },
    }),
  },
}));
vi.mock("@/kernel/messaging/lark", () => ({ notifyOps: vi.fn(async () => true) }));

const { judgeResult, routineResult, recordRoutineRun } = await import("@/kernel/audit/routine-runs");

beforeEach(() => {
  inserted.length = 0;
});

describe("judgeResult", () => {
  it("is ok for a plain result and skipped only on the status word", () => {
    expect(judgeResult({ status: "ok", sent: 2 })).toEqual({ status: "ok", error: null });
    expect(judgeResult({ status: "skipped", reason: "not a run day" })).toEqual({ status: "skipped", error: null });
    expect(judgeResult({ skipped: 3 })).toEqual({ status: "ok", error: null });
    expect(judgeResult(null)).toEqual({ status: "ok", error: null });
  });

  it("makes failures an error that names them", () => {
    const v = judgeResult({
      status: "ok",
      failures: [{ subject: "Acme", step: "publish", error: "invalid input syntax for type uuid" }],
    });
    expect(v).toEqual({ status: "error", error: "Acme at publish: invalid input syntax for type uuid" });
  });

  it("names five failures and counts the rest", () => {
    const failures = Array.from({ length: 7 }, (_, i) => ({ subject: `c${i}`, step: "read", error: "timeout" }));
    const v = judgeResult({ status: "ok", failures });
    expect(v.status).toBe("error");
    expect(v.error).toContain("c4 at read: timeout");
    expect(v.error).not.toContain("c5");
    expect(v.error).toMatch(/; and 2 more$/);
  });

  it("makes an outcome short of expected an error, even when skipped is claimed", () => {
    expect(judgeResult({ status: "ok", outcome: { expected: 4, done: 0, unit: "pages" } })).toEqual({
      status: "error",
      error: "done 0 of 4 pages",
    });
    expect(judgeResult({ status: "skipped", outcome: { expected: 2, done: 1, unit: "rates" } }).status).toBe("error");
    expect(judgeResult({ status: "ok", outcome: { expected: 4, done: 4, unit: "pages" } }).status).toBe("ok");
  });

  it("ignores a failures key that is not a list of failures", () => {
    expect(judgeResult({ status: "ok", failures: ["a bare string"] }).status).toBe("ok");
    expect(judgeResult({ status: "ok", failures: 3 }).status).toBe("ok");
  });
});

describe("routineResult", () => {
  it("answers 200 with the result unchanged when the run is ok", async () => {
    const res = routineResult({ status: "ok", published: 4 });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "ok", published: 4 });
  });

  it("answers 500 with the judged error when the kernel says error", async () => {
    const res = routineResult({ status: "ok", failures: [{ subject: "VCB", step: "rates", error: "503" }] });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("VCB at rates: 503");
    expect(body.failures).toHaveLength(1);
  });
});

describe("recordRoutineRun with a typed result", () => {
  it("records failures as an error run whose error names them", async () => {
    await recordRoutineRun("/api/cron/thing/", async () =>
      Response.json({ status: "ok", failures: [{ subject: "Acme", step: "publish", error: "boom" }] }),
    );
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ status: "error", error: "Acme at publish: boom" });
  });

  it("records a short outcome as an error even inside a 200", async () => {
    await recordRoutineRun("/api/cron/thing/", async () =>
      Response.json({ status: "ok", outcome: { expected: 4, done: 3, unit: "pages" } }),
    );
    expect(inserted[0]).toMatchObject({ status: "error", error: "done 3 of 4 pages" });
  });

  it("keeps a handler's own error text over the judged one", async () => {
    await recordRoutineRun("/api/cron/thing/", async () =>
      Response.json({ error: "read failed", failures: [{ subject: "x", step: "y", error: "z" }] }, { status: 500 }),
    );
    expect(inserted[0]).toMatchObject({ status: "error", error: "read failed" });
  });

  it("records a typed ok result as ok with no error", async () => {
    await recordRoutineRun("/api/cron/thing/", async () => routineResult({ status: "ok", sent: 2 }));
    expect(inserted[0]).toMatchObject({ status: "ok", error: null });
  });
});

describe("currentRunId (Y.72.1)", () => {
  it("is null outside a run and inside a run whose claim failed", async () => {
    const { currentRunId } = await import("@/kernel/audit/routine-runs");
    expect(currentRunId()).toBeNull();
    let inside: string | null = "unset";
    // This file's database double has no rpc, so the claim fails and the run has no id yet.
    await recordRoutineRun("/api/cron/thing/", async () => {
      inside = currentRunId();
      return Response.json({ status: "ok" });
    });
    expect(inside).toBeNull();
  });
});
