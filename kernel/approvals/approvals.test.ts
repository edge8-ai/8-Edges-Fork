import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// S.5. The approvals primitive: one pending approval per subject, a decision
// always leaves a row, a failure is reported rather than thrown (the flow's own
// write has landed), and "waiting on me" is theirs and their permissions' (RB.3),
// plus the unassigned for an admin.
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
const recordAudit = vi.fn(async (_input: unknown) => {});
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: (i: unknown) => recordAudit(i) }));

import { cancelApproval, decideApproval, decidePendingApproval, openApproval, withdrawPendingApproval } from "./requests";
import { hasWaitingOn, latestApproval, waitingOn } from "./waiting";
import { contentVersion } from "./version";

const REF = { subjectType: "time_off" as const, subjectId: "lv-1" };

beforeEach(() => {
  resetFake();
  recordAudit.mockClear();
});

describe("openApproval", () => {
  it("opens a pending approval naming its approver and the line the lists show", async () => {
    script("approvals", { data: null }, { error: null });
    const r = await openApproval({ ...REF, requestedBy: "rowan", approverPersonId: "juno", label: "Annual leave · 1–3 Oct" });
    expect(r).toEqual({ ok: true });
    const insert = calls.find((c) => c.ops[0] === "insert");
    expect(insert?.payloads[0]).toEqual({
      subject_type: "time_off",
      subject_id: "lv-1",
      requested_by: "rowan",
      state: "pending",
      approver_person_id: "juno",
      approver_permission: null,
      metadata: { label: "Annual leave · 1–3 Oct" },
    });
  });

  // RB.3. A claim waits on whoever holds a permission, not on one person.
  it("opens a pending approval addressed to a permission's holders, naming no person", async () => {
    script("approvals", { data: null }, { error: null });
    const r = await openApproval({
      subjectType: "reimbursement_check",
      subjectId: "cl-1",
      requestedBy: "rowan",
      approverPermission: "reimbursements.check",
      label: "Taxi",
    });
    expect(r).toEqual({ ok: true });
    expect(calls.find((c) => c.ops[0] === "insert")?.payloads[0]).toEqual(
      expect.objectContaining({ subject_type: "reimbursement_check", approver_person_id: null, approver_permission: "reimbursements.check", state: "pending" }),
    );
  });

  it("clears the other approver column when a refresh moves a request from a permission to a person", async () => {
    script("approvals", { data: { id: "ap-1" } }, { error: null });
    await openApproval({ ...REF, requestedBy: "rowan", approverPersonId: "kai", label: "x" });
    expect(calls.find((c) => c.ops[0] === "update")?.payloads[0]).toEqual(expect.objectContaining({ approver_person_id: "kai", approver_permission: null }));
  });

  it("refuses a request addressed to a person and a permission at once, writing nothing", async () => {
    // The type refuses both; a caller that gets round it is refused at run time.
    const both = { ...REF, requestedBy: "rowan", approverPersonId: "juno", approverPermission: "reimbursements.check", label: "x" } as unknown as Parameters<
      typeof openApproval
    >[0];
    expect(await openApproval(both)).toEqual({ ok: false, error: "An approval waits on a person or on a permission, never both." });
    expect(calls).toHaveLength(0);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ failed: "open" }) }));
  });

  it("refuses a permission that is not an atom, so it never reaches a filter", async () => {
    const r = await openApproval({ ...REF, requestedBy: null, approverPermission: "x),approver_person_id.is.null", label: "x" });
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("refreshes the one already pending instead of opening a second", async () => {
    script("approvals", { data: { id: "ap-1" } }, { error: null });
    await openApproval({ ...REF, requestedBy: "rowan", approverPersonId: "kai", label: "x" });
    expect(calls.some((c) => c.ops[0] === "insert")).toBe(false);
    expect(calls.find((c) => c.ops[0] === "update")?.filters).toContainEqual(["eq", "id", "ap-1"]);
  });

  it("reports a failed write as a Result and audits it, never throws", async () => {
    script("approvals", { data: null }, { error: { message: "db down" } });
    expect(await openApproval({ ...REF, requestedBy: null, approverPersonId: null, label: "x" })).toEqual({ ok: false, error: "db down" });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ table: "approvals", context: expect.objectContaining({ failed: "open" }) }));
  });
});

describe("decideApproval", () => {
  it("closes the pending approval with the decision, who took it and when", async () => {
    script("approvals", { data: [{ id: "ap-1" }] });
    await decideApproval({ ...REF, state: "approved", decidedBy: "juno" });
    const update = calls.find((c) => c.ops[0] === "update");
    expect(update?.payloads[0]).toEqual(expect.objectContaining({ state: "approved", decided_by: "juno", decided_at: expect.any(String) }));
    expect(update?.filters).toContainEqual(["eq", "state", "pending"]);
  });

  it("writes a decided row when nothing was pending, so every decision leaves one", async () => {
    script("approvals", { data: [] }, { error: null });
    await decideApproval({ ...REF, state: "rejected", decidedBy: "juno", reason: "overlaps a launch" });
    expect(calls.find((c) => c.ops[0] === "insert")?.payloads[0]).toEqual(
      expect.objectContaining({ subject_id: "lv-1", state: "rejected", decided_by: "juno", reason: "overlaps a launch" }),
    );
  });
});

describe("cancelApproval", () => {
  it("withdraws the pending approval and stops there", async () => {
    script("approvals", { data: [{ id: "ap-1" }] });
    expect(await cancelApproval({ ...REF, cancelledBy: "rowan" })).toEqual({ ok: true });
    expect(calls[0].payloads[0]).toEqual(expect.objectContaining({ state: "cancelled", decided_by: "rowan" }));
    expect(calls[0].filters).toContainEqual(["eq", "state", "pending"]);
    expect(calls).toHaveLength(1);
  });

  // A.30.1. A subject's answer is its latest approval row, so cancelling one
  // already decided appends the cancellation rather than leaving the decision
  // standing. Leave and contractor estimates both reach this: approved leave can
  // be cancelled, and so can an approved estimate.
  const decided = { state: "approved", requested_by: "rowan", approver_person_id: "juno", metadata: { label: "Annual leave · 1–3 Oct" } };

  it.each(["time_off", "contractor_estimate"] as const)("appends a cancelled row to a %s approval already decided", async (subjectType) => {
    script("approvals", { data: [] }, { data: decided }, { data: { id: "ap-2" } });
    expect(await cancelApproval({ subjectType, subjectId: "s-1", cancelledBy: "rowan" })).toEqual({ ok: true });
    const latest = calls[1];
    expect(latest.filters).toEqual([
      ["eq", "subject_type", subjectType],
      ["eq", "subject_id", "s-1"],
    ]);
    expect(latest.ops).toContain("order");
    expect(calls[2].ops[0]).toBe("insert");
    expect(calls[2].payloads[0]).toEqual({
      subject_type: subjectType,
      subject_id: "s-1",
      requested_by: "rowan",
      approver_person_id: "juno",
      metadata: { label: "Annual leave · 1–3 Oct" },
      state: "cancelled",
      decided_by: "rowan",
      decided_at: expect.any(String),
      reason: null,
    });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ table: "approvals", recordId: "ap-2", operation: "insert" }));
  });

  it("keeps the permission a decided request was addressed to on the cancellation it appends", async () => {
    const check = { state: "approved", requested_by: "rowan", approver_person_id: null, approver_permission: "reimbursements.check", metadata: { label: "Taxi" } };
    script("approvals", { data: [] }, { data: check }, { data: { id: "ap-3" } });
    await cancelApproval({ subjectType: "reimbursement_check", subjectId: "cl-1", cancelledBy: "rowan" });
    expect(calls[2].payloads[0]).toEqual(expect.objectContaining({ state: "cancelled", approver_person_id: null, approver_permission: "reimbursements.check" }));
  });

  it("appends to a rejected approval too, so the history says who withdrew it", async () => {
    script("approvals", { data: [] }, { data: { ...decided, state: "rejected" } }, { error: null });
    await cancelApproval({ ...REF, cancelledBy: "kai" });
    expect(calls[2].payloads[0]).toEqual(expect.objectContaining({ state: "cancelled", decided_by: "kai" }));
  });

  it("does nothing more for a subject with nothing on record, or one already cancelled", async () => {
    script("approvals", { data: [] }, { data: null }, { data: [] }, { data: { ...decided, state: "cancelled" } });
    expect(await cancelApproval({ ...REF, cancelledBy: "rowan" })).toEqual({ ok: true });
    expect(await cancelApproval({ ...REF, cancelledBy: "rowan" })).toEqual({ ok: true });
    expect(calls.some((c) => c.ops[0] === "insert")).toBe(false);
  });

  it("reports a failed read of the latest row and a failed append, never throws", async () => {
    script("approvals", { data: [] }, { error: { message: "read down" } });
    expect(await cancelApproval({ ...REF, cancelledBy: "rowan" })).toEqual({ ok: false, error: "read down" });
    script("approvals", { data: [] }, { data: decided }, { error: { message: "insert down" } });
    expect(await cancelApproval({ ...REF, cancelledBy: "rowan" })).toEqual({ ok: false, error: "insert down" });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ failed: "cancel" }) }));
  });
});

// Y.16, Y.17. An agent run that ends before its approval is decided withdraws
// the pending row and nothing else: a post already published stays approved.
describe("withdrawPendingApproval", () => {
  it("withdraws the pending approval with who and why", async () => {
    script("approvals", { data: [{ id: "ap-1" }] });
    expect(await withdrawPendingApproval({ subjectType: "campaign_publish", subjectId: "c-1", cancelledBy: "kai", reason: "the run was stopped" })).toEqual({ ok: true, withdrawn: true });
    expect(calls[0].payloads[0]).toEqual(expect.objectContaining({ state: "cancelled", decided_by: "kai", reason: "the run was stopped" }));
    expect(calls[0].filters).toContainEqual(["eq", "state", "pending"]);
  });

  it("appends nothing after a decision, unlike cancelApproval", async () => {
    script("approvals", { data: [] });
    expect(await withdrawPendingApproval({ subjectType: "campaign_publish", subjectId: "c-1", cancelledBy: "kai" })).toEqual({ ok: true, withdrawn: false });
    expect(calls).toHaveLength(1);
    expect(calls.some((c) => c.ops[0] === "insert")).toBe(false);
  });

  it("reports a failed write, never throws", async () => {
    script("approvals", { error: { message: "down" } });
    expect(await withdrawPendingApproval({ subjectType: "letter_send", subjectId: "b-1", cancelledBy: null })).toEqual({ ok: false, error: "down" });
  });
});

// Y.16/Y.17 review: a decision bound to the row and version the decider checked.
describe("decidePendingApproval with expect", () => {
  const ref = { subjectType: "campaign_publish" as const, subjectId: "c-1", state: "approved" as const, decidedBy: "kai" };

  it("decides only that row, and only while it carries that version", async () => {
    script("approvals", { data: { id: "ap-1", metadata: { version: "abc" } } }, { data: [{ id: "ap-1" }] });
    expect(await decidePendingApproval({ ...ref, expect: { id: "ap-1", version: "abc" } })).toEqual({ ok: true, decided: true });
    expect(calls[1].filters).toContainEqual(["eq", "metadata->>version", "abc"]);
    expect(calls[1].filters).toContainEqual(["eq", "id", "ap-1"]);
  });

  it("decides nothing when the pending row is another one", async () => {
    script("approvals", { data: { id: "ap-2", metadata: { version: "abc" } } });
    expect(await decidePendingApproval({ ...ref, expect: { id: "ap-1", version: "abc" } })).toEqual({ ok: true, decided: false });
    expect(calls).toHaveLength(1);
  });

  it("decides nothing when the version was refreshed under the click", async () => {
    script("approvals", { data: { id: "ap-1", metadata: { version: "def" } } }, { data: [] });
    expect(await decidePendingApproval({ ...ref, expect: { id: "ap-1", version: "abc" } })).toEqual({ ok: true, decided: false });
  });
});

describe("latestApproval", () => {
  it("answers the subject's latest row, newest first", async () => {
    script("approvals", { data: [{ id: "ap-2", state: "approved", metadata: { version: "abc" }, decided_by: "kai", decided_at: "2026-10-09" }] });
    expect(await latestApproval("campaign_publish", "c-1")).toEqual({ id: "ap-2", state: "approved", metadata: { version: "abc" }, decidedBy: "kai", decidedAt: "2026-10-09" });
    expect(calls[0].ops).toContain("order");
  });

  it("answers null for a subject with nothing on record", async () => {
    script("approvals", { data: [] });
    expect(await latestApproval("letter_send", "b-1")).toBeNull();
  });

  it("raises a failed read: no approval must never be what a hiccup says", async () => {
    script("approvals", { error: { message: "down" } });
    await expect(latestApproval("letter_send", "b-1")).rejects.toThrow(/down/);
  });
});

describe("contentVersion", () => {
  it("is the same for the same content whatever the key order, and changes with one byte", () => {
    const a = contentVersion({ title: "T", body: "Hello" });
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(contentVersion({ body: "Hello", title: "T" })).toBe(a);
    expect(contentVersion({ title: "T", body: "Hello." })).not.toBe(a);
    expect(contentVersion({ title: "T", body: null })).toBe(contentVersion({ title: "T", body: undefined }));
  });
});

describe("waitingOn", () => {
  const row = { id: "ap-1", subject_type: "time_off", subject_id: "lv-1", requested_by: "rowan", metadata: { label: "Annual leave" }, created_at: "2026-09-25" };

  // The filter the primitive sent, read back from the fake: pending rows only,
  // and one `or` naming every way a row may be addressed to this person.
  const addressedBy = () => {
    expect(calls[0].filters).toContainEqual(["eq", "state", "pending"]);
    const or = calls[0].filters.filter((f) => f[0] === "or");
    expect(or).toHaveLength(1);
    return String(or[0][1]);
  };
  const UNASSIGNED = "and(approver_person_id.is.null,approver_permission.is.null)";

  it("gives a team member only what names them", async () => {
    script("approvals", { data: [row] });
    const list = await waitingOn("juno", { admin: false, permissions: [] });
    expect(list.map((a) => [a.subjectType, a.label])).toEqual([["time_off", "Annual leave"]]);
    expect(addressedBy()).toBe("approver_person_id.eq.juno");
  });

  it("gives an admin what names them plus what names nobody", async () => {
    script("approvals", { data: [] });
    await waitingOn("juno", { admin: true, permissions: [] });
    expect(addressedBy()).toBe(`approver_person_id.eq.juno,${UNASSIGNED}`);
  });

  it("gives an admin with no person record only what names nobody", async () => {
    script("approvals", { data: [] });
    await waitingOn(null, { admin: true, permissions: [] });
    expect(addressedBy()).toBe(UNASSIGNED);
  });

  // RB.3. A claim's check waits on whoever holds reimbursements.check.
  it("gives anyone what is addressed to a permission they hold, as well as what names them", async () => {
    script("approvals", { data: [{ ...row, id: "ap-2", subject_type: "reimbursement_check", subject_id: "cl-1", metadata: { label: "Taxi" } }] });
    const list = await waitingOn("finance", { admin: false, permissions: ["reimbursements.check", "surface.team"] });
    expect(list.map((a) => [a.subjectType, a.subjectId, a.label])).toEqual([["reimbursement_check", "cl-1", "Taxi"]]);
    expect(addressedBy()).toBe('approver_person_id.eq.finance,approver_permission.in.("reimbursements.check","surface.team")');
  });

  // Design §1.5: nobody checks or approves their own claim. The To check list
  // leaves the viewer's own claims out, so "Waiting on you" must too, on every
  // surface that lists it; other subjects keep their requester's rows.
  it("never lists a claim's check or approval to the person who made the claim", async () => {
    script("approvals", {
      data: [
        { ...row, id: "ap-own", subject_type: "reimbursement_check", subject_id: "cl-own", requested_by: "finance", metadata: { label: "Own taxi" } },
        { ...row, id: "ap-own-2", subject_type: "reimbursement_approval", subject_id: "cl-own", requested_by: "finance", metadata: { label: "Own taxi" } },
        { ...row, id: "ap-other", subject_type: "reimbursement_check", subject_id: "cl-2", requested_by: "person-a", metadata: { label: "Avery's taxi" } },
        { ...row, id: "ap-leave", requested_by: "finance" },
      ],
    });
    const list = await waitingOn("finance", { admin: true, permissions: ["reimbursements.check", "reimbursements.approve"] });
    expect(list.map((a) => a.id)).toEqual(["ap-other", "ap-leave"]);
  });

  // Z.12.1: the weekly client status is the account owner's draft, never an
  // approval. A row left pending under either of its old words (the library's
  // held page, or Z.12's release) is history, and no inbox or "Waiting on you"
  // may list it, however it is addressed.
  it("never lists a weekly client status, under either of its old words", async () => {
    script("approvals", {
      data: [
        { ...row, id: "ap-page", subject_type: "client_status_page", subject_id: "doc-1", requested_by: null, metadata: { label: "Client A Weekly Status 2026-10-09" } },
        { ...row, id: "ap-report", subject_type: "client_status_report", subject_id: "rep-1", requested_by: null, metadata: { label: "Client A: weekly status" } },
        { ...row, id: "ap-leave" },
      ],
    });
    const list = await waitingOn("juno", { admin: true, permissions: ["client-programs.status-release", "library.manage"] });
    expect(list.map((a) => a.id)).toEqual(["ap-leave"]);
  });

  it("does not count a row addressed to a permission as unassigned, so it never falls to every admin", async () => {
    script("approvals", { data: [] });
    await waitingOn("juno", { admin: true, permissions: ["boards.open"] });
    const filter = addressedBy();
    // The admins' share is the rows that name neither a person nor a permission;
    // a bare "approver_person_id is null" would take in every permission's rows.
    expect(filter.split(",").filter((clause) => clause === "approver_person_id.is.null")).toEqual([]);
    expect(filter).toBe(`approver_person_id.eq.juno,approver_permission.in.("boards.open"),${UNASSIGNED}`);
  });

  it("drops a permission that is not an atom rather than splicing it into the filter", async () => {
    script("approvals", { data: [] });
    await waitingOn("juno", { admin: false, permissions: ["x),approver_person_id.is.null", "time-off.approve"] });
    expect(addressedBy()).toBe('approver_person_id.eq.juno,approver_permission.in.("time-off.approve")');
  });

  it("reads nothing for nobody: no person, no permissions, not an admin", async () => {
    expect(await waitingOn(null, { admin: false, permissions: [] })).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("raises a failed read instead of answering that nothing is waiting", async () => {
    script("approvals", { error: { message: "db down" } });
    await expect(waitingOn("juno", { admin: false, permissions: [] })).rejects.toThrow("db down");
  });
});

// The implied Approver role (ADR 0013) follows what waits on the person
// themselves. A request addressed to a permission waits on its holders, and
// holding reimbursements.check must not make anyone an Approver of leave.
describe("hasWaitingOn", () => {
  it("counts only what names the person, never what names a permission", async () => {
    script("approvals", { count: 1 });
    expect(await hasWaitingOn("juno")).toBe(true);
    expect(calls[0].filters).toEqual([
      ["eq", "state", "pending"],
      ["eq", "approver_person_id", "juno"],
    ]);
    expect(JSON.stringify(calls[0].filters)).not.toContain("approver_permission");
  });

  it("answers no when nothing names them, whatever they hold", async () => {
    script("approvals", { count: 0 });
    expect(await hasWaitingOn("finance")).toBe(false);
  });

  it("raises a failed count, so the resolver refuses rather than drops the role", async () => {
    script("approvals", { error: { message: "db down" } });
    await expect(hasWaitingOn("juno")).rejects.toThrow("db down");
  });
});
