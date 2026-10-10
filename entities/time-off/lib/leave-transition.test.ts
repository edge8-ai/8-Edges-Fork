import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// A.30. One step moves a leave request: the transition rules, a write guarded on
// the status the caller read, the approval that records it and the fact on the
// bus. The approvals primitive is real here, on the kernel fake, so what these
// assert is the approval rows actually written, in order, beside the leave's
// status and the facts published — never which helper ran.
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
const recordAudit = vi.fn(async (_input: unknown) => {});
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: (i: unknown) => recordAudit(i) }));
const published: [string, Record<string, unknown>][] = [];
vi.mock("@/kernel/events", () => ({
  publish: async (name: string, payload: Record<string, unknown>) => void published.push([name, payload]),
}));
let leadsOrg = false;
vi.mock("./approver", () => ({ leadsTheOrg: async () => leadsOrg }));

import { createLeave, transitionLeave, type LeaveRow, type LeaveWriter, type NewLeaveRow } from "./leave-transition";
import { approvedByPolicy, humanDeciders } from "./leave-approvals";
import { nextLeaveStatus, type LeaveActor, type LeaveDecision, type LeaveStatus } from "./transitions";

const span = { id: "lv-1", teamMemberId: "tm-1", startDate: "2026-10-01", endDate: "2026-10-03", leaveType: "annual" };
const row = (status: LeaveStatus): LeaveRow => ({ ...span, status });

// The caller's scoped writer, faked: it records what it was asked to write and
// answers as the database would — the matched rows, nothing, or a refusal.
type Answer = "lands" | "matches nothing" | "refused";
function writer(answer: Answer) {
  const asked: { patch: Record<string, unknown>; from: LeaveStatus }[] = [];
  const write: LeaveWriter = async (patch, from) => {
    asked.push({ patch, from });
    if (answer === "refused") return { data: null, error: { message: "db down" } };
    return { data: answer === "lands" ? [{ id: "lv-1" }] : [], error: null };
  };
  return { write, asked };
}

const approvalWrites = () =>
  calls
    .filter((c) => c.table === "approvals" && (c.ops[0] === "insert" || c.ops[0] === "update"))
    .map((c): Record<string, unknown> => ({ op: c.ops[0], ...(c.payloads[0] as Record<string, unknown>) }));

const decided = { requested_by: "rowan", approver_person_id: "juno", metadata: { label: "Rowan · Annual · 1–3 Oct" } };

beforeEach(() => {
  resetFake();
  recordAudit.mockClear();
  published.length = 0;
  leadsOrg = false;
});

describe("transitionLeave", () => {
  // Each row: who, from what, doing what; how the approvals table answers the
  // primitive's reads; then the approval rows written and the facts stated.
  const moves: {
    name: string;
    actor: LeaveActor;
    from: LeaveStatus;
    decision: LeaveDecision;
    approvals: Parameters<typeof script>[1][];
    writes: Record<string, unknown>[];
    facts: [string, Record<string, unknown>][];
  }[] = [
    {
      name: "an admin approves a pending request",
      actor: "admin",
      from: "requested",
      decision: "approved",
      approvals: [{ data: [{ id: "ap-1" }] }],
      writes: [{ op: "update", state: "approved", decided_by: "kai" }],
      facts: [["leave.approved", { requestId: "lv-1", teamMemberId: "tm-1", actorPersonId: "kai" }]],
    },
    {
      name: "an admin denies leave already approved: the decision is kept and the denial appended",
      actor: "admin",
      from: "approved",
      decision: "rejected",
      approvals: [{ data: [] }, { error: null }],
      writes: [
        { op: "update", state: "rejected" },
        { op: "insert", state: "rejected", decided_by: "kai" },
      ],
      facts: [["leave.withdrawn", { requestId: "lv-1", became: "rejected", actorPersonId: "kai" }]],
    },
    {
      name: "the employee cancels leave already approved: the cancellation is appended after it",
      actor: "employee",
      from: "approved",
      decision: "cancelled",
      approvals: [{ data: [] }, { data: { state: "approved", ...decided } }, { error: null }],
      writes: [
        { op: "update", state: "cancelled" },
        { op: "insert", state: "cancelled", decided_by: "kai", requested_by: "rowan", approver_person_id: "juno" },
      ],
      facts: [["leave.withdrawn", { requestId: "lv-1", became: "cancelled", startDate: "2026-10-01", endDate: "2026-10-03" }]],
    },
    {
      name: "an admin cancels approved leave the same way",
      actor: "admin",
      from: "approved",
      decision: "cancelled",
      approvals: [{ data: [] }, { data: { state: "approved", ...decided } }, { error: null }],
      writes: [
        { op: "update", state: "cancelled" },
        { op: "insert", state: "cancelled" },
      ],
      facts: [["leave.withdrawn", { became: "cancelled" }]],
    },
    {
      name: "the employee withdraws a request nobody decided: its approval is cancelled and nothing is stated",
      actor: "employee",
      from: "requested",
      decision: "cancelled",
      approvals: [{ data: [{ id: "ap-1" }] }],
      writes: [{ op: "update", state: "cancelled", decided_by: "kai" }],
      facts: [],
    },
    {
      name: "an Edge8 manager approves a pending request",
      actor: "manager",
      from: "requested",
      decision: "approved",
      approvals: [{ data: [{ id: "ap-1" }] }],
      writes: [{ op: "update", state: "approved" }],
      facts: [["leave.approved", { requestId: "lv-1" }]],
    },
    {
      name: "a client manager denies a pending request: a denial states nothing",
      actor: "client-manager",
      from: "requested",
      decision: "rejected",
      approvals: [{ data: [{ id: "ap-1" }] }],
      writes: [{ op: "update", state: "rejected" }],
      facts: [],
    },
  ];

  it.each(moves)("$name", async (m) => {
    script("approvals", ...m.approvals);
    const w = writer("lands");
    expect(await transitionLeave({ row: row(m.from), decision: m.decision, actor: m.actor, write: w.write, decidedBy: "kai" })).toEqual({ ok: true });
    expect(w.asked).toHaveLength(1);
    expect(w.asked[0].from).toBe(m.from);
    expect(w.asked[0].patch.status).toBe(m.decision);
    expect(approvalWrites()).toEqual(m.writes.map((x) => expect.objectContaining(x)));
    expect(published).toEqual(m.facts.map(([name, payload]) => [name, expect.objectContaining(payload)]));
  });

  // Every actor × current status × decision, with the pure rules as the oracle
  // for whether the move is allowed. What this adds over the rules' own table
  // is everything after them: a refused or no-op move touches nothing, and an
  // applied one writes once, records the approval the new status calls for and
  // states exactly the facts it means.
  const ACTORS: LeaveActor[] = ["admin", "employee", "manager", "client-manager"];
  const STATUSES: LeaveStatus[] = ["requested", "approved", "rejected", "cancelled", "taken"];
  const DECISIONS: LeaveDecision[] = ["approved", "rejected", "cancelled"];
  const sweep = ACTORS.flatMap((actor) => STATUSES.flatMap((from) => DECISIONS.map((decision) => ({ actor, from, decision }))));

  it.each(sweep)("$actor, $from → $decision: writes, records and states only what the rules allow", async ({ actor, from, decision }) => {
    // Enough for any move: the pending row closes, so nothing is read or appended.
    script("approvals", { data: [{ id: "ap-1" }] });
    const w = writer("lands");
    const rule = nextLeaveStatus(from, decision, actor);
    const result = await transitionLeave({ row: row(from), decision, actor, write: w.write, decidedBy: "kai" });
    if (rule.outcome !== "apply") {
      expect(result).toEqual(rule.outcome === "noop" ? { ok: true } : { ok: false, error: rule.error });
      expect(w.asked).toHaveLength(0);
      expect(calls).toHaveLength(0);
      expect(published).toEqual([]);
      return;
    }
    expect(result).toEqual({ ok: true });
    expect(w.asked).toEqual([{ patch: expect.objectContaining({ status: rule.status }), from }]);
    expect(approvalWrites()[0]).toEqual(expect.objectContaining({ op: "update", state: rule.status }));
    const expected = [
      ...(rule.status === "approved" ? ["leave.approved"] : []),
      ...(from === "approved" && (rule.status === "cancelled" || rule.status === "rejected") ? ["leave.withdrawn"] : []),
    ];
    expect(published.map(([name]) => name)).toEqual(expected);
  });

  it("stamps when a decision was taken, and leaves that alone on a cancellation", async () => {
    script("approvals", { data: [{ id: "ap-1" }] }, { data: [{ id: "ap-1" }] });
    const approve = writer("lands");
    await transitionLeave({ row: row("requested"), decision: "approved", actor: "admin", write: approve.write, decidedBy: "kai" });
    expect(approve.asked[0].patch).toEqual({ status: "approved", approved_at: expect.any(String) });
    const cancel = writer("lands");
    await transitionLeave({ row: row("requested"), decision: "cancelled", actor: "employee", write: cancel.write, decidedBy: "kai" });
    expect(cancel.asked[0].patch).toEqual({ status: "cancelled" });
  });

  it.each([
    ["a client manager revisiting an admin's approval", "client-manager", "approved", "rejected", "This request has already been decided."],
    ["an employee deciding their own leave", "employee", "requested", "approved", "You cannot decide your own leave."],
    ["cancelling leave already taken", "admin", "taken", "cancelled", "Taken leave cannot be cancelled."],
  ] as const)("refuses %s without writing anything", async (_name, actor, from, decision, error) => {
    const w = writer("lands");
    expect(await transitionLeave({ row: row(from), decision, actor, write: w.write, decidedBy: "kai" })).toEqual({ ok: false, error });
    expect(w.asked).toHaveLength(0);
    expect(calls).toHaveLength(0);
    expect(published).toEqual([]);
  });

  it("answers ok without writing for a request already where it is asked to go", async () => {
    const w = writer("lands");
    expect(await transitionLeave({ row: row("cancelled"), decision: "cancelled", actor: "employee", write: w.write, decidedBy: "kai" })).toEqual({ ok: true });
    expect(w.asked).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["manager", "approved", "This request has already been decided."],
    ["client-manager", "rejected", "This request has already been decided."],
    ["admin", "approved", "This request changed while you were deciding. Reload and try again."],
    ["employee", "cancelled", "This request changed while you were cancelling it. Reload and try again."],
  ] as const)("records and states nothing when a %s's write matched nothing", async (actor, decision, error) => {
    const w = writer("matches nothing");
    expect(await transitionLeave({ row: row("requested"), decision, actor, write: w.write, decidedBy: "kai" })).toEqual({ ok: false, error });
    expect(calls).toHaveLength(0);
    expect(published).toEqual([]);
  });

  it("records and states nothing when the write is refused", async () => {
    const w = writer("refused");
    expect(await transitionLeave({ row: row("requested"), decision: "approved", actor: "admin", write: w.write, decidedBy: "kai" })).toEqual({
      ok: false,
      error: "db down",
    });
    expect(calls).toHaveLength(0);
    expect(published).toEqual([]);
  });

  it("keeps a move that landed when its approval cannot be written, and audits the failure", async () => {
    script("approvals", { error: { message: "approvals down" } });
    const w = writer("lands");
    expect(await transitionLeave({ row: row("requested"), decision: "approved", actor: "admin", write: w.write, decidedBy: "kai" })).toEqual({ ok: true });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ table: "approvals", context: expect.objectContaining({ failed: "decide" }) }));
    expect(published.map(([name]) => name)).toEqual(["leave.approved"]);
  });
});

describe("createLeave", () => {
  const leave = { teamMemberId: "tm-1", leaveType: "annual", startDate: "2026-10-01", endDate: "2026-10-03", isHalfDay: false, days: 3, reason: null };
  const requester = { personId: "rowan", name: "Rowan" };
  type Inserted = { data: { id: string } | null; error: { message: string } | null };
  function inserter(answer: Inserted = { data: { id: "lv-1" }, error: null }) {
    const rows: NewLeaveRow[] = [];
    return { rows, insert: async (r: NewLeaveRow) => (rows.push(r), answer) };
  }

  it("files a request that waits on the approver the caller resolved, and states nothing yet", async () => {
    script("approvals", { data: null }, { error: null });
    const ins = inserter();
    const approver = { kind: "edge8" as const, personId: "juno", email: "j@x.test", displayName: "Juno", companyId: null };
    expect(await createLeave({ leave, arrival: { status: "requested", requester, approver }, insert: ins.insert, actorPersonId: "rowan" })).toEqual({
      ok: true,
      id: "lv-1",
    });
    expect(ins.rows).toEqual([expect.objectContaining({ team_member_id: "tm-1", status: "requested", approved_at: null, days: 3 })]);
    expect(approvalWrites()).toEqual([
      expect.objectContaining({ op: "insert", state: "pending", requested_by: "rowan", approver_person_id: "juno", metadata: expect.objectContaining({ approverKind: "edge8" }) }),
    ]);
    expect(published).toEqual([]);
  });

  it("leaves a request with no approver to the admins, or to the requester when they lead the organisation", async () => {
    script("approvals", { data: null }, { error: null }, { data: null }, { error: null });
    await createLeave({ leave, arrival: { status: "requested", requester, approver: null }, insert: inserter().insert, actorPersonId: "rowan" });
    leadsOrg = true;
    await createLeave({ leave, arrival: { status: "requested", requester, approver: null }, insert: inserter().insert, actorPersonId: "rowan" });
    expect(approvalWrites().map((w) => [w.approver_person_id, (w.metadata as { approverKind: unknown }).approverKind])).toEqual([
      [null, null],
      ["rowan", "self"],
    ]);
  });

  it("records a policy approval as decided by nobody, and announces it", async () => {
    script("approvals", { data: [] }, { error: null });
    const ins = inserter();
    await createLeave({ leave, arrival: { status: "approved", by: "policy", requester }, insert: ins.insert, actorPersonId: "rowan" });
    expect(ins.rows[0]).toEqual(expect.objectContaining({ status: "approved", approved_at: expect.any(String) }));
    expect(approvalWrites()).toEqual([
      expect.objectContaining({ op: "update", state: "approved" }),
      expect.objectContaining({
        op: "insert",
        state: "approved",
        decided_by: null,
        requested_by: "rowan",
        metadata: expect.objectContaining({ approverKind: "policy", label: expect.stringContaining("Rowan") }),
      }),
    ]);
    expect(published).toEqual([["leave.approved", expect.objectContaining({ requestId: "lv-1", actorPersonId: "rowan" })]]);
  });

  it("records leave an admin logs as their own decision", async () => {
    script("approvals", { data: [] }, { error: null });
    await createLeave({ leave, arrival: { status: "approved", by: "admin", decidedBy: "kai" }, insert: inserter().insert, actorPersonId: "kai" });
    expect(approvalWrites()[1]).toEqual(
      expect.objectContaining({ op: "insert", state: "approved", decided_by: "kai", requested_by: "kai", metadata: expect.objectContaining({ approverKind: "admin" }) }),
    );
    expect(published).toEqual([["leave.approved", expect.objectContaining({ actorPersonId: "kai" })]]);
  });

  it.each([
    ["refused", { data: null, error: { message: "db down" } }, "db down"],
    ["answered with no row", { data: null, error: null }, "Could not save the request."],
  ] as const)("records and states nothing when the insert is %s", async (_name, answer, error) => {
    const result = await createLeave({ leave, arrival: { status: "approved", by: "policy", requester }, insert: inserter(answer).insert, actorPersonId: "rowan" });
    expect(result).toEqual({ ok: false, error });
    expect(calls).toHaveLength(0);
    expect(published).toEqual([]);
  });
});

describe("approvedByPolicy (the admin board's auto)", () => {
  it("reads leave approved by policy as auto, and a person's decision or an import as not", () => {
    const deciders = humanDeciders([
      { subject_id: "lv-policy", decided_by: null, metadata: { approverKind: "policy" } },
      { subject_id: "lv-admin", decided_by: null, metadata: { approverKind: "admin" } },
    ]);
    const leave = (id: string, over: Partial<{ approved_at: string | null; external_source: string | null }> = {}) => ({
      id,
      approved_at: "2026-09-26T00:00:00Z",
      external_source: null,
      ...over,
    });
    expect(approvedByPolicy(leave("lv-policy"), deciders)).toBe(true);
    // An admin known only by email names no person, and is still a decision.
    expect(approvedByPolicy(leave("lv-admin"), deciders)).toBe(false);
    // History from before approvals existed has no row at all.
    expect(approvedByPolicy(leave("lv-old"), deciders)).toBe(true);
    expect(approvedByPolicy(leave("lv-import", { external_source: "bamboo" }), deciders)).toBe(false);
    expect(approvedByPolicy(leave("lv-pending", { approved_at: null }), deciders)).toBe(false);
  });
});

describe("humanDeciders (the admin board's decider per request)", () => {
  it("keeps each request's latest decider and leaves a policy approval out, so it still reads as auto", () => {
    const deciders = humanDeciders([
      { subject_id: "lv-1", decided_by: "juno", metadata: { approverKind: "edge8" } },
      { subject_id: "lv-1", decided_by: "kai", metadata: { approverKind: "admin" } },
      { subject_id: "lv-2", decided_by: null, metadata: { approverKind: "policy" } },
      { subject_id: "lv-3", decided_by: null, metadata: null },
    ]);
    expect(deciders.get("lv-1")).toBe("kai");
    expect(deciders.has("lv-2")).toBe(false);
    expect(deciders.has("lv-3")).toBe(true);
  });
});
