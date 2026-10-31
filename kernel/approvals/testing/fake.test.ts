import { beforeEach, describe, expect, it } from "vitest";
import { approvals, approvalsFor, requestsFake, resetApprovalsFake, waitingFake } from "./fake";

// The fake stands in for the approvals table in every flow that parks on a
// decision, so each rule requests.ts keeps is proved here once, rather than
// trusted in four suites that each assumed it.

const REF = { subjectType: "campaign_publish" as const, subjectId: "draft-1" };
const ASKER = "person-asker";
const DECIDER = "person-decider";

beforeEach(() => resetApprovalsFake());

describe("the approvals fake", () => {
  it("keeps one pending row per subject: a second open refreshes it and keeps the asker", async () => {
    await requestsFake.openApproval({ ...REF, approverPermission: "campaigns.publish", requestedBy: ASKER, label: "First", metadata: { version: "v1" } });
    await requestsFake.openApproval({ ...REF, approverPersonId: DECIDER, requestedBy: "someone-else", label: "Second", metadata: { version: "v2" } });

    const rows = approvalsFor(REF.subjectType, REF.subjectId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      state: "pending",
      requestedBy: ASKER,
      approverPersonId: DECIDER,
      approverPermission: null,
      metadata: { label: "Second", version: "v2" },
    });
  });

  it("refuses an approval addressed to a person and a permission at once", async () => {
    const both = { ...REF, approverPersonId: DECIDER, approverPermission: "campaigns.publish", requestedBy: ASKER, label: "x" } as unknown as Parameters<
      typeof requestsFake.openApproval
    >[0];
    expect(await requestsFake.openApproval(both)).toMatchObject({ ok: false });
    expect(await requestsFake.openApproval({ ...REF, approverPermission: "not an atom", requestedBy: ASKER, label: "x" })).toMatchObject({ ok: false });
    expect(approvals.rows).toHaveLength(0);
  });

  it("decides only a pending row, so the second of two racing decisions decides nothing", async () => {
    await requestsFake.openApproval({ ...REF, approverPersonId: null, requestedBy: ASKER, label: "Ask" });
    const first = await requestsFake.decidePendingApproval({ ...REF, state: "approved", decidedBy: DECIDER });
    const second = await requestsFake.decidePendingApproval({ ...REF, state: "rejected", decidedBy: "late", reason: "too late" });

    expect(first).toEqual({ ok: true, decided: true });
    expect(second).toEqual({ ok: true, decided: false });
    expect(approvalsFor(REF.subjectType, REF.subjectId)).toEqual([expect.objectContaining({ state: "approved", decidedBy: DECIDER, reason: null })]);
  });

  it("binds a decision to the row and the version the decider read", async () => {
    await requestsFake.openApproval({ ...REF, approverPersonId: null, requestedBy: ASKER, label: "Ask", metadata: { version: "v1" } });
    const id = approvals.rows[0].id;

    expect(await requestsFake.decidePendingApproval({ ...REF, state: "approved", decidedBy: DECIDER, expect: { id: "another-row", version: "v1" } })).toEqual({ ok: true, decided: false });
    expect(await requestsFake.decidePendingApproval({ ...REF, state: "approved", decidedBy: DECIDER, expect: { id, version: "v0" } })).toEqual({ ok: true, decided: false });
    expect(await requestsFake.decidePendingApproval({ ...REF, state: "approved", decidedBy: DECIDER, expect: { id, version: "v1" }, metadata: { seen: true } })).toEqual({
      ok: true,
      decided: true,
    });
    expect(approvals.rows[0].metadata).toEqual({ label: "Ask", version: "v1", seen: true });
  });

  it("writes a row already decided when decideApproval finds nothing pending", async () => {
    await requestsFake.decideApproval({ ...REF, state: "approved", decidedBy: DECIDER, requestedBy: ASKER, label: "On the spot" });
    expect(approvals.rows).toEqual([
      expect.objectContaining({ state: "approved", decidedBy: DECIDER, approverPersonId: DECIDER, requestedBy: ASKER, metadata: { label: "On the spot" } }),
    ]);
  });

  it("withdraws only a pending row, and says whether it did", async () => {
    expect(await requestsFake.withdrawPendingApproval({ ...REF, cancelledBy: ASKER })).toEqual({ ok: true, withdrawn: false });

    await requestsFake.openApproval({ ...REF, approverPersonId: null, requestedBy: ASKER, label: "Ask" });
    await requestsFake.decidePendingApproval({ ...REF, state: "approved", decidedBy: DECIDER });
    expect(await requestsFake.withdrawPendingApproval({ ...REF, cancelledBy: ASKER, reason: "restarted" })).toEqual({ ok: true, withdrawn: false });
    expect(approvals.rows.map((r) => r.state)).toEqual(["approved"]);
  });

  it("appends a cancellation after a decision, and writes nothing over a cancelled one", async () => {
    await requestsFake.openApproval({ ...REF, approverPersonId: null, requestedBy: ASKER, label: "Ask" });
    await requestsFake.decidePendingApproval({ ...REF, state: "approved", decidedBy: DECIDER });
    await requestsFake.cancelApproval({ ...REF, cancelledBy: ASKER });
    await requestsFake.cancelApproval({ ...REF, cancelledBy: ASKER });

    const rows = approvalsFor(REF.subjectType, REF.subjectId);
    expect(rows.map((r) => [r.state, r.decidedBy])).toEqual([
      ["approved", DECIDER],
      ["cancelled", ASKER],
    ]);
    expect(rows[1]).toMatchObject({ requestedBy: ASKER, metadata: { label: "Ask" }, reason: null });
  });

  it("cancels a pending row in place", async () => {
    await requestsFake.openApproval({ ...REF, approverPersonId: null, requestedBy: ASKER, label: "Ask" });
    await requestsFake.cancelApproval({ ...REF, cancelledBy: ASKER });
    expect(approvals.rows).toEqual([expect.objectContaining({ state: "cancelled", decidedBy: ASKER })]);
  });

  it("answers a subject's newest row in the full SubjectApproval shape", async () => {
    expect(await waitingFake.latestApproval(REF.subjectType, REF.subjectId)).toBeNull();

    await requestsFake.openApproval({ ...REF, approverPersonId: null, requestedBy: ASKER, label: "Ask" });
    await requestsFake.decidePendingApproval({ ...REF, state: "rejected", decidedBy: DECIDER, reason: "not this week" });
    const latest = await waitingFake.latestApproval(REF.subjectType, REF.subjectId);

    expect(latest).toEqual({
      id: approvals.rows[0].id,
      state: "rejected",
      metadata: { label: "Ask" },
      decidedBy: DECIDER,
      decidedAt: expect.any(String),
      requestedBy: ASKER,
      reason: "not this week",
    });
    // A copy: a reader that edits what it was handed changes nothing stored.
    latest!.metadata.label = "edited";
    expect(approvals.rows[0].metadata.label).toBe("Ask");
  });

  it("annotates the newest row whatever its state, and refuses a subject with none", async () => {
    expect(await requestsFake.annotateApproval({ ...REF, metadata: { invoice: "INV-1" } })).toMatchObject({ ok: false });

    await requestsFake.openApproval({ ...REF, approverPersonId: null, requestedBy: ASKER, label: "Ask" });
    await requestsFake.decidePendingApproval({ ...REF, state: "approved", decidedBy: DECIDER });
    expect(await requestsFake.annotateApproval({ ...REF, metadata: { invoice: "INV-1" } })).toEqual({ ok: true });
    expect(approvals.rows[0].metadata).toEqual({ label: "Ask", invoice: "INV-1" });
  });

  it("keeps subjects apart, by type as well as id", async () => {
    await requestsFake.openApproval({ ...REF, approverPersonId: null, requestedBy: ASKER, label: "Writer" });
    await requestsFake.openApproval({ subjectType: "letter_send", subjectId: REF.subjectId, approverPersonId: null, requestedBy: ASKER, label: "Letter" });
    await requestsFake.decidePendingApproval({ ...REF, state: "approved", decidedBy: DECIDER });

    expect(approvalsFor("letter_send", REF.subjectId)).toEqual([expect.objectContaining({ state: "pending" })]);
  });

  it("runs afterRead once, after the read it follows", async () => {
    await requestsFake.openApproval({ ...REF, approverPersonId: null, requestedBy: ASKER, label: "Ask", metadata: { version: "v1" } });
    let ran = 0;
    approvals.afterRead = () => {
      ran += 1;
      approvals.rows[0].metadata.version = "v2";
    };
    const read = await waitingFake.latestApproval(REF.subjectType, REF.subjectId);
    await waitingFake.latestApproval(REF.subjectType, REF.subjectId);

    expect(read?.metadata.version).toBe("v1");
    expect(ran).toBe(1);
  });
});
