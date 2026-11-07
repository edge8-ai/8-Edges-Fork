import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, resetFake, script, tick, timeline as ordered } from "@/kernel/data/testing/fake-company-os";

// The employee's own submit path, which is where most Edge8 leave actually
// becomes approved (S.2).
//
// The admin's decide button is the visible approval and the one everybody
// tests; it is also the minority. Edge8 Core Team's policy auto-approves, so a
// Core Team member submitting leave has the row INSERTED approved and no
// decision ever happens. If the fact is not stated here it is never stated at
// all — coaching's `leave.approved` subscriber never runs, and a 1-1 already
// booked inside the span sits in the holiday until the nightly cycle stamps it
// missed, which is exactly the scan S.2 set out to replace.
//
// So this drives `requestOwnTimeOff` against the kernel's house Supabase fake and the
// real bus, with the insert and the publish on ONE timeline: the ordering rule
// (announce only after the row exists) is asserted, not assumed.

// Writes and publishes in the order they HAPPENED (W.135): the fake stamps each
// query when it is answered, and the stubbed insert and the publish stamp
// themselves on the same clock. Build order was not enough — an announce raced
// against its write in a Promise.all read as "write, then announce".
const stamped: { at: number; label: string }[] = [];
const timeline = () => ordered(stamped);

// What the actor's policy says, and what the insert returns. Both are the
// entity's own seams — the table-scoped write helpers in entities/team — so
// they are stubbed rather than driven through the fake, and the stub records
// the insert on the timeline.
let policy: { policyName: string | null; autoApprove: boolean } = {
  policyName: "Edge8 Core Team",
  autoApprove: true,
};
let insertResult: { data: { id: string } | null; error: string | null } = {
  data: { id: "req-new" },
  error: null,
};
const insertedRows: Record<string, unknown>[] = [];

// S.5: time off opens and settles approvals on the kernel primitive; recorded
// here, so a test can say which approval a flow touched.
const approvalWrites: [string, Record<string, unknown>][] = [];
vi.mock("@/kernel/approvals/requests", () => ({
  openApproval: async (r: Record<string, unknown>) => (approvalWrites.push(["open", r]), { ok: true }),
  decideApproval: async (r: Record<string, unknown>) => (approvalWrites.push(["decide", r]), { ok: true }),
  cancelApproval: async (r: Record<string, unknown>) => (approvalWrites.push(["cancel", r]), { ok: true }),
}));
vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
  supabase: { from: (table: string) => builderFor(table) },
  htt: { from: (table: string) => builderFor(table) },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The action asks for its declared permission first (ADR 0013); recorded so the
// test pins which one.
const asked: string[] = [];
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async (p: string) => void asked.push(p) }));
vi.mock("@/kernel/identity/team-auth", () => ({
  requireTeamMember: async () => ({
    teamMemberId: "tm-1",
    personId: "person-1",
    // displayName is the older order audit rows keep; name is what a client
    // approver reads (S.19.6), so the two differ here to prove which is used.
    displayName: "Dana",
    greeting: "Dana",
    name: "Dana Lee",
  }),
}));
vi.mock("@/entities/team", () => ({
  getOwnApprovalPolicy: async () => policy,
  teamInsertOwn: async (_actor: unknown, table: string, row: Record<string, unknown>) => {
    insertedRows.push(row);
    // Stamped when the write completes, not when it is asked for.
    await null;
    stamped.push({ at: tick(), label: `${table}:insert` });
    return insertResult;
  },
  teamRead: () => builderFor("time_off"),
}));
vi.mock("@/kernel/messaging/lark", () => ({ notifyOps: vi.fn(async () => {}) }));
vi.mock("@/kernel/messaging/email", () => ({ sendTransactionalEmail: vi.fn(async () => {}) }));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: () => "https://example.test" }));

import { addDays, saigonToday } from "@/kernel/config/dates";
import { resetSubscribers, subscribe } from "@/kernel/events";
import { calls } from "@/kernel/data/testing/fake-company-os";
import { cancelOwnTimeOff, requestOwnTimeOff } from "./actions";

// Relative to today, so the test does not start asserting on leave in the past
// the moment a hard-coded month goes by.
const future = { start: addDays(saigonToday(), 30), end: addDays(saigonToday(), 34) };
const past = { start: addDays(saigonToday(), -12), end: addDays(saigonToday(), -8) };

function submit(span: { start: string; end: string }) {
  return requestOwnTimeOff({
    leaveType: "vacation",
    startDate: span.start,
    endDate: span.end,
    isHalfDay: false,
    reason: "",
  });
}

/** No clashing request, no holidays in the span. */
function scriptCleanSubmit() {
  script("time_off", { data: null });
  script("holidays", { data: [] });
}

const published: unknown[] = [];
const withdrawn: unknown[] = [];

beforeEach(() => {
  asked.length = 0;
  resetFake();
  stamped.length = 0;
  published.length = 0;
  withdrawn.length = 0;
  approvalWrites.length = 0;
  insertedRows.length = 0;
  policy = { policyName: "Edge8 Core Team", autoApprove: true };
  insertResult = { data: { id: "req-new" }, error: null };
  resetSubscribers();
  subscribe("test", "leave.approved", (payload) => {
    stamped.push({ at: tick(), label: "publish:leave.approved" });
    published.push(payload);
  });
  subscribe("test", "leave.withdrawn", (payload) => void withdrawn.push(payload));
});
afterEach(() => {
  resetSubscribers();
  vi.clearAllMocks();
});

describe("requestOwnTimeOff", () => {
  it("announces the approval a policy auto-approval creates, after the row exists", async () => {
    scriptCleanSubmit();

    await expect(submit(future)).resolves.toEqual({ ok: true, autoApproved: true });

    expect(insertedRows[0]?.status).toBe("approved");
    expect(asked).toEqual(["time-off.mine"]);
    expect(published).toEqual([
      {
        requestId: "req-new",
        teamMemberId: "tm-1",
        startDate: future.start,
        endDate: future.end,
        leaveType: "vacation",
        // The requester caused an auto-approval, so the inbox tells nobody (S.19.9).
        actorPersonId: "person-1",
      },
    ]);
    // The row, then the fact. Announcing first would hand coaching a span the
    // database had not accepted. Compared by position rather than by tail,
    // because the approver lookup this action fires and forgets keeps landing
    // on the timeline afterwards.
    expect(timeline().indexOf("time_off:insert")).toBeGreaterThanOrEqual(0);
    expect(timeline().indexOf("publish:leave.approved")).toBeGreaterThan(
      timeline().indexOf("time_off:insert"),
    );
    // A.30: approved by policy is still a decided approval, naming nobody, so
    // a later cancellation has a row to follow.
    expect(approvalWrites).toEqual([
      ["decide", expect.objectContaining({ subjectId: "req-new", state: "approved", decidedBy: null, requestedBy: "person-1", metadata: expect.objectContaining({ approverKind: "policy" }) })],
    ]);
  });

  it("announces the approval for back-dated leave, which is confirmed on entry", async () => {
    // Days already taken are a record, not a request: the row is inserted
    // approved even under a manual policy, so it is the same missing fact.
    policy = { policyName: "On Target", autoApprove: false };
    scriptCleanSubmit();

    await expect(submit(past)).resolves.toEqual({ ok: true, autoApproved: true });

    expect(published).toHaveLength(1);
  });

  it("announces nothing when the policy leaves the request pending", async () => {
    policy = { policyName: "On Target", autoApprove: false };
    scriptCleanSubmit();
    // The requester has a manager above them, so the request does not wait on them.
    script("team_members", { data: { manager_id: "tm-lead", status: "active" } });

    await expect(submit(future)).resolves.toEqual({ ok: true, autoApproved: false });

    expect(insertedRows[0]?.status).toBe("requested");
    expect(published).toEqual([]);
    // A pending request opens an approval, so it is on someone's "waiting on me" list (S.5).
    expect(approvalWrites.at(-1)).toEqual([
      "open",
      expect.objectContaining({ subjectType: "time_off", subjectId: "req-new", requestedBy: "person-1", label: expect.stringContaining("Dana Lee · Vacation · "), approverPersonId: null }),
    ]);
  });

  it("routes the leave of whoever leads the organisation to them, since nobody is above them", async () => {
    policy = { policyName: "On Target", autoApprove: false };
    scriptCleanSubmit();
    script("team_members", { data: { manager_id: null, status: "active" } });
    await expect(submit(future)).resolves.toEqual({ ok: true, autoApproved: false });
    expect(approvalWrites.at(-1)).toEqual(["open", expect.objectContaining({ approverPersonId: "person-1", requestedBy: "person-1" })]);
  });

  it("announces nothing when the insert is refused", async () => {
    insertResult = { data: null, error: "row level security" };
    scriptCleanSubmit();

    await expect(submit(future)).resolves.toEqual({ ok: false, error: "row level security" });

    expect(published).toEqual([]);
  });
});

// A.30. The employee's own cancel goes through the one leave step: the write is
// filtered to their own row and to the status just read, so a manager deciding
// in between wins, and cancelling leave already approved withdraws it.
describe("cancelOwnTimeOff", () => {
  const approved = { status: "approved", team_member_id: "tm-1", start_date: future.start, end_date: future.end, leave_type: "vacation" };

  it("cancels their approved leave on their own row only, settles the approval and says it was withdrawn", async () => {
    script("time_off", { data: approved }, { data: [{ id: "req-1" }] });
    await expect(cancelOwnTimeOff("req-1")).resolves.toEqual({ ok: true });
    const update = calls.find((c) => c.table === "time_off" && c.ops[0] === "update");
    expect(update?.payloads[0]).toEqual({ status: "cancelled" });
    expect(update?.filters).toEqual([
      ["eq", "id", "req-1"],
      ["eq", "team_member_id", "tm-1"],
      ["eq", "status", "approved"],
    ]);
    expect(approvalWrites).toEqual([["cancel", expect.objectContaining({ subjectId: "req-1", cancelledBy: "person-1" })]]);
    expect(withdrawn).toEqual([expect.objectContaining({ requestId: "req-1", became: "cancelled", actorPersonId: "person-1" })]);
  });

  it("changes nothing when the request moved after it was read", async () => {
    script("time_off", { data: { ...approved, status: "requested" } }, { data: [] });
    await expect(cancelOwnTimeOff("req-1")).resolves.toEqual({
      ok: false,
      error: "This request changed while you were cancelling it. Reload and try again.",
    });
    expect(approvalWrites).toEqual([]);
    expect(withdrawn).toEqual([]);
  });

  it("refuses somebody else's request before writing anything", async () => {
    script("time_off", { data: { ...approved, team_member_id: "tm-2" } });
    await expect(cancelOwnTimeOff("req-1")).resolves.toEqual({ ok: false, error: "Request not found." });
    expect(calls.some((c) => c.ops[0] === "update")).toBe(false);
  });
});
