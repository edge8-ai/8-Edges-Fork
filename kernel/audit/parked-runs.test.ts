import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Y.16, Y.17. A run parked on a person or a timed send is one `waiting` row,
// and parking twice is still one: the unique index refuses the second, which is
// the park already being there. Closing is fenced to a row still waiting.
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));

const { closeParkedRun, parkRun } = await import("./parked-runs");

beforeEach(() => resetFake());

describe("parkRun", () => {
  it("opens a waiting row under the agent's routine with its own tick", async () => {
    script("routine_runs", { error: null });
    expect(await parkRun("/api/cron/writer-agent/", "c1:e:publish-approval-abc", "Waiting.")).toEqual({ ok: true });
    expect(calls[0].ops[0]).toBe("insert");
    expect(calls[0].payloads[0]).toEqual(
      expect.objectContaining({ routine_id: "/api/cron/writer-agent/", tick_key: "c1:e:publish-approval-abc", status: "waiting", mode: "live", summary: "Waiting." }),
    );
  });

  it("on a duplicate tick reopens a closed wait, and leaves one still waiting as it is", async () => {
    script("routine_runs", { error: { message: "duplicate key", code: "23505" } as { message: string } }, { error: null });
    expect(await parkRun("/api/cron/letter-agent/", "b1:-:send-due", "Scheduled.")).toEqual({ ok: true });
    const reopen = calls[1];
    expect(reopen.ops[0]).toBe("update");
    expect(reopen.payloads[0]).toEqual(expect.objectContaining({ status: "waiting", summary: "Scheduled.", finished_at: null }));
    // Only a closed row is reopened; a row still waiting is matched by nothing.
    expect(reopen.filters).toContainEqual(["in", "status", ["ok", "skipped"]]);
  });

  it("reports any other failure", async () => {
    script("routine_runs", { error: { message: "down" } });
    expect(await parkRun("/api/cron/letter-agent/", "t", "s")).toEqual({ ok: false, error: "routine_runs park: down" });
  });
});

describe("closeParkedRun", () => {
  it("closes only a row still waiting, with how the wait ended", async () => {
    script("routine_runs", { error: null });
    expect(await closeParkedRun("/api/cron/writer-agent/", "t", { status: "ok", summary: "rejected" })).toEqual({ ok: true });
    expect(calls[0].payloads[0]).toEqual(expect.objectContaining({ status: "ok", summary: "rejected", finished_at: expect.any(String) }));
    expect(calls[0].filters).toContainEqual(["eq", "status", "waiting"]);
    expect(calls[0].filters).toContainEqual(["eq", "tick_key", "t"]);
  });
});
