import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// A client manager's approval is the same fact as an admin's, and it has to
// reach the bus the same way (S.2).
//
// This is the second of the two approve transitions, and the one most likely
// to be forgotten: the portal has its own action, its own guards and its own
// table write, so "time-off announces approvals" can be true on the admin
// screen and false here. Deleting the announce call, or lifting it above the
// update so an approval a client manager was not allowed to make is announced
// anyway, are both invisible to a test of `leaveApprovedFact`. The timeline
// below records the write and the publish together, because the order is the
// rule.

// Writes and publishes in the order they landed. The kernel fake records each
// query as it is built, which is before it is awaited, so reading the calls
// made so far at the moment of the publish puts each write on the right side
// of it.
const events: string[] = [];
let seen = 0;
function catchUp() {
  for (const c of calls.slice(seen)) events.push(`${c.table}:${c.ops[0] ?? "?"}`);
  seen = calls.length;
}
const timeline = () => (catchUp(), events);

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

import type { PortalActor } from "@/kernel/identity/portal-auth";
import { resetSubscribers, subscribe } from "@/kernel/events";
import { decideAssignedTimeOff } from "./time-off";

const actor = {
  authUserId: "auth-1",
  personId: "person-1",
  displayName: "Client Manager",
  greeting: "Client",
  email: "manager@client.example",
  companyScope: ["co-1"],
  memberships: [],
  impersonation: null,
} as unknown as PortalActor;

const request = {
  id: "req-1",
  status: "requested",
  team_member_id: "tm-1",
  start_date: "2026-10-05",
  end_date: "2026-10-09",
  leave_type: "annual",
};

/**
 * The reads decideAssignedTimeOff makes before it writes: the scope, the row,
 * and the approver resolution that has to name this actor independently.
 */
function scriptApprovedPath() {
  script(
    "staff_assignments",
    { data: [{ team_member_id: "tm-1" }] },
    { data: [{ client_manager_person_id: "person-1", company_id: "co-1" }] },
  );
  script("people", {
    data: { id: "person-1", email: "manager@client.example", preferred_name: "Manager", first_name: null, full_name: null },
  });
}

const published: unknown[] = [];

beforeEach(() => {
  resetFake();
  events.length = 0;
  seen = 0;
  published.length = 0;
  resetSubscribers();
  subscribe("test", "leave.approved", (payload) => {
    catchUp();
    events.push("publish:leave.approved");
    published.push(payload);
  });
});
afterEach(() => {
  resetSubscribers();
  vi.clearAllMocks();
});

describe("decideAssignedTimeOff", () => {
  it("announces the approval, and only after the row says approved", async () => {
    scriptApprovedPath();
    script("time_off", { data: request }, { data: [{ id: "req-1" }] });

    await expect(decideAssignedTimeOff(actor, "req-1", "approved")).resolves.toEqual({ ok: true });

    expect(published).toEqual([
      {
        requestId: "req-1",
        teamMemberId: "tm-1",
        startDate: "2026-10-05",
        endDate: "2026-10-09",
        leaveType: "annual",
        // The client manager who decided, so the inbox leaves them out (S.19.9).
        actorPersonId: "person-1",
      },
    ]);
    expect(timeline().slice(-2)).toEqual(["time_off:update", "publish:leave.approved"]);
    // The approval it answered is settled with the client manager's person (S.5).
    expect(approvalWrites.at(-1)).toEqual(["decide", { subjectType: "time_off", subjectId: "req-1", state: "approved", decidedBy: actor.personId }]);
  });

  it("announces nothing when the update is refused", async () => {
    // The write is filtered on `status = requested`, so a race loses it here;
    // announcing first would tell coaching to move a 1-1 for a decision that
    // somebody else had already taken the other way.
    scriptApprovedPath();
    script("time_off", { data: request }, { error: { message: "row level security" } });

    await expect(decideAssignedTimeOff(actor, "req-1", "approved")).resolves.toEqual({
      ok: false,
      error: "row level security",
    });

    expect(published).toEqual([]);
  });

  it("announces nothing when the approver check refuses the actor", async () => {
    // Scope said yes and the transition is legal, but the placement names
    // somebody else — no write happens, so no fact is stated either.
    script(
      "staff_assignments",
      { data: [{ team_member_id: "tm-1" }] },
      { data: [{ client_manager_person_id: "person-9", company_id: "co-1" }] },
    );
    script("people", {
      data: { id: "person-9", email: "other@client.example", preferred_name: "Other", first_name: null, full_name: null },
    });
    script("time_off", { data: request });

    await expect(decideAssignedTimeOff(actor, "req-1", "approved")).resolves.toEqual({
      ok: false,
      error: "You cannot decide this request.",
    });

    expect(published).toEqual([]);
    expect(timeline()).not.toContain("time_off:update");
  });

  it("announces and records nothing when the request was decided between the read and the write", async () => {
    approvalWrites.length = 0;
    scriptApprovedPath();
    // The update is guarded on status = requested; matching no row means somebody else decided first.
    script("time_off", { data: request }, { data: [] });
    await expect(decideAssignedTimeOff(actor, "req-1", "approved")).resolves.toEqual({ ok: false, error: "This request has already been decided." });
    expect(published).toEqual([]);
    expect(approvalWrites).toEqual([]);
  });

  it("announces nothing on a denial", async () => {
    scriptApprovedPath();
    script("time_off", { data: request }, { data: [{ id: "req-1" }] });

    await expect(decideAssignedTimeOff(actor, "req-1", "rejected")).resolves.toEqual({ ok: true });

    expect(published).toEqual([]);
    expect(timeline()).toContain("time_off:update");
  });
});
