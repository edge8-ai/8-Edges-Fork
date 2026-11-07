import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// A.38. The version-checked decision every approval-gated flow makes: the
// writer's Publish, the letter's send, the proposal's Publish, the meeting
// follow-up and the hiring chain. Each kept its own copy of it, and the copies
// drifted: two had no resume for an approval that landed when the move after
// it did not. The outcomes are tested here once; each flow tests what it does
// with them.
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => {}) }));
const closedRuns = vi.hoisted(() => [] as unknown[][]);
vi.mock("@/kernel/audit/parked-runs", () => ({ closeParkedRun: vi.fn(async (...args: unknown[]) => { closedRuns.push(args); return { ok: true }; }) }));

import { decideForVersion, withdrawAndClose } from "./versioned";

const REF = { subjectType: "campaign_publish" as const, subjectId: "cmp-1" };
const BY = { personId: "person-1", email: "approver@example.com" };
const row = (state: string, version: string, extra: Record<string, unknown> = {}) => ({
  id: `apr-${state}-${version}`,
  state,
  metadata: { version, run: `tick-${version}` },
  decided_by: null,
  decided_at: null,
  requested_by: null,
  reason: null,
  ...extra,
});
const writes = () => calls.filter((c) => c.table === "approvals" && c.ops[0] === "update");

beforeEach(() => {
  resetFake();
  closedRuns.length = 0;
});

describe("decideForVersion", () => {
  it("approves the pending approval for the current version, bound to that row and that version", async () => {
    const pending = row("pending", "v2");
    // The latest row, then the decision's own read of the pending row, then its write.
    script("approvals", { data: [pending] }, { data: { id: pending.id, metadata: pending.metadata } }, { data: [{ id: pending.id }] });

    const res = await decideForVersion({ ref: REF, seen: "v2", current: "v2", by: BY, metadata: { approvedBy: BY.email } });

    expect(res).toMatchObject({ outcome: "decided", latest: { id: pending.id } });
    expect(writes()).toHaveLength(1);
    expect(writes()[0].payloads[0]).toMatchObject({ state: "approved", decided_by: "person-1", metadata: { version: "v2", approvedBy: BY.email } });
    expect(writes()[0].filters).toContainEqual(["eq", "metadata->>version", "v2"]);
  });

  it("answers already-approved when the current version was approved and nothing moved, so the flow resumes rather than asks twice", async () => {
    script("approvals", { data: [row("approved", "v2")] });

    await expect(decideForVersion({ ref: REF, seen: "v2", current: "v2", by: BY })).resolves.toMatchObject({ outcome: "already-approved", latest: { state: "approved" } });
    // Even from a page that loaded before the approval: the decision exists.
    script("approvals", { data: [row("approved", "v2")] });
    await expect(decideForVersion({ ref: REF, seen: "v1", current: "v2", by: BY })).resolves.toMatchObject({ outcome: "already-approved" });
    expect(writes()).toEqual([]);
  });

  it("asks for a reload, and changes nothing, when the page is old but the waiting approval is already for the current version", async () => {
    script("approvals", { data: [row("pending", "v2")] });

    await expect(decideForVersion({ ref: REF, seen: "v1", current: "v2", by: BY })).resolves.toMatchObject({ outcome: "reload" });
    expect(writes()).toEqual([]);
  });

  it("asks again when the waiting approval is for an older version, handing back that stale row and whether the page was stale too", async () => {
    const stale = row("pending", "v1");
    script("approvals", { data: [stale] }, { data: [stale] });

    await expect(decideForVersion({ ref: REF, seen: "v2", current: "v2", by: BY })).resolves.toEqual({ outcome: "ask-again", stalePending: expect.objectContaining({ id: stale.id }), pageStale: false });
    await expect(decideForVersion({ ref: REF, seen: "v1", current: "v2", by: BY })).resolves.toMatchObject({ outcome: "ask-again", pageStale: true });
    expect(writes()).toEqual([]);
  });

  it("asks again with nothing to withdraw when no approval is waiting", async () => {
    script("approvals", { data: [row("rejected", "v1")] });

    await expect(decideForVersion({ ref: REF, seen: "v2", current: "v2", by: BY })).resolves.toEqual({ outcome: "ask-again", stalePending: null, pageStale: false });
  });

  it("answers lost when another decision or a new ask took the row between the read and the write", async () => {
    const pending = row("pending", "v2");
    script("approvals", { data: [pending] }, { data: { id: "apr-someone-else", metadata: {} } });

    await expect(decideForVersion({ ref: REF, seen: "v2", current: "v2", by: BY })).resolves.toMatchObject({ outcome: "lost" });
  });

  // The letter checks a row's recipients and window before it freezes its
  // copy, then decides: a row re-asked at the same version in between names a
  // send the approver never saw, so it is not theirs to decide.
  it("answers lost, deciding nothing, when the row waiting is not the one the caller checked", async () => {
    script("approvals", { data: [row("pending", "v2", { id: "apr-reasked" })] });

    await expect(decideForVersion({ ref: REF, seen: "v2", current: "v2", by: BY, expectId: "apr-checked" })).resolves.toMatchObject({ outcome: "lost" });
    expect(writes()).toEqual([]);
  });

  it("answers failed, never no-approval, when the approvals cannot be read", async () => {
    script("approvals", { error: { message: "timeout" } });

    await expect(decideForVersion({ ref: REF, seen: "v2", current: "v2", by: BY })).resolves.toEqual({ outcome: "failed", error: "Could not read the approval: read failed: [approvals] latest: timeout" });
  });

  it("carries who asked and why on the row it hands back", async () => {
    script("approvals", { data: [row("approved", "v2", { requested_by: "person-7", reason: "fits the brief" })] });

    await expect(decideForVersion({ ref: REF, seen: "v2", current: "v2", by: BY })).resolves.toMatchObject({ latest: { requestedBy: "person-7", reason: "fits the brief" } });
  });
});

describe("withdrawAndClose", () => {
  it("withdraws the waiting approval and closes the run parked on it, as skipped", async () => {
    const pending = row("pending", "v1");
    script("approvals", { data: [{ id: pending.id }] });

    await expect(withdrawAndClose({ ref: REF, latest: { id: pending.id, state: "pending", metadata: pending.metadata, decidedBy: null, decidedAt: null, requestedBy: null, reason: null }, routineId: "/api/cron/writer/", by: BY, reason: "The post changed.", summary: "superseded: the post changed" })).resolves.toEqual({ ok: true });

    expect(writes()[0].payloads[0]).toMatchObject({ state: "cancelled", decided_by: "person-1", reason: "The post changed." });
    expect(closedRuns).toEqual([["/api/cron/writer/", "tick-v1", { status: "skipped", summary: "superseded: the post changed" }]]);
  });

  it("reads the latest row itself when not handed one, and touches nothing when nothing waits", async () => {
    script("approvals", { data: [row("approved", "v1")] });

    await expect(withdrawAndClose({ ref: REF, routineId: "/api/cron/writer/", by: BY, reason: "Stopped." })).resolves.toEqual({ ok: true });

    expect(writes()).toEqual([]);
    expect(closedRuns).toEqual([]);
  });
});
