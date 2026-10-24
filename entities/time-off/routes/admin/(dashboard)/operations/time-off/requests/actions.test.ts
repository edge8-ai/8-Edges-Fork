import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, resetFake, script, tick, timeline as ordered } from "@/kernel/data/testing/fake-company-os";

// The approve transition itself, not just the mapper it calls (S.2).
//
// transitions.test.ts pins `leaveApprovedFact` — a pure function over a row —
// and that is the easy half. The half that actually breaks is the wiring in
// this action: whether the announcement happens at all, and whether it happens
// AFTER the row is written. Deleting the announce call, or lifting it above the
// update so a refused write still tells coaching to move somebody's 1-1, are
// both invisible to a test of the mapper. So this file drives `decideTimeOff`
// against the kernel's house Supabase fake and records the writes and the publish on ONE
// timeline, because the order between them is the rule.
//
// The bus is the real one: the payload goes through the catalogue's schema, and
// a subscriber registered here sees exactly what a deployment's subscriber
// would.

// Writes and publishes in the order they HAPPENED (W.135): the fake stamps each
// query when it is answered, and the publish stamps itself on the same clock.
// Build order was not enough — an announce raced against its write in a
// Promise.all read as "write, then announce".
const stamped: { at: number; label: string }[] = [];
const timeline = () => ordered(stamped);

// S.5: time off opens and settles approvals on the kernel primitive; recorded
// here, so a test can say which approval a flow touched.
const approvalWrites: [string, Record<string, unknown>][] = [];
vi.mock("@/kernel/approvals/requests", () => ({
  openApproval: async (r: Record<string, unknown>) => (approvalWrites.push(["open", r]), { ok: true }),
  decideApproval: async (r: Record<string, unknown>) => (approvalWrites.push(["decide", r]), { ok: true }),
  cancelApproval: async (r: Record<string, unknown>) => (approvalWrites.push(["cancel", r]), { ok: true }),
}));
const personIdForEmail = vi.fn(async () => "admin-person");
vi.mock("@/kernel/identity/person-by-email", () => ({ personIdForEmail: () => personIdForEmail() }));
vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
  supabase: { from: (table: string) => builderFor(table) },
  htt: { from: (table: string) => builderFor(table) },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The action asks for its declared permission first (ADR 0013); recorded so the
// test pins which one.
const asked: string[] = [];
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (p: string) => {
    asked.push(p);
    return { user: { email: "admin@example.com" } };
  },
}));

import { resetSubscribers, subscribe } from "@/kernel/events";
import { cancelTimeOff, createTimeOff, decideTimeOff } from "./actions";

const request = {
  status: "requested",
  team_member_id: "tm-1",
  start_date: "2026-10-05",
  end_date: "2026-10-09",
  leave_type: "annual",
};

/** The acting admin's team membership, which the self-decision check compares with the request's. */
function scriptApprover() {
  script("team_members", { data: [{ id: "tm-9" }] });
}
/** What the status-guarded update answers when it lands. */
const LANDED = { data: [{ id: "req-1" }] };

const published: unknown[] = [];
const withdrawn: unknown[] = [];

beforeEach(() => {
  asked.length = 0;
  resetFake();
  stamped.length = 0;
  published.length = 0;
  withdrawn.length = 0;
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

describe("createTimeOff", () => {
  // The path with no decision in it. An admin logging leave inserts the row
  // already approved, so there is no approve button to announce from later:
  // if this insert says nothing, coaching never hears, and a 1-1 booked inside
  // the span waits to be stamped missed. Same timeline assertion as the decide
  // tests, because the ordering rule is the same one.
  const logged = {
    teamMemberId: "tm-1",
    leaveType: "vacation",
    startDate: "2026-10-05",
    endDate: "2026-10-09",
    isHalfDay: false,
    reason: "",
  };

  it("announces the approval it just created, after the row exists", async () => {
    // The overlap check, then the insert — both on time_off, in that order.
    script("time_off", { data: null }, { data: { id: "req-new" } });
    scriptApprover();
    script("holidays", { data: [] });

    await expect(createTimeOff(logged)).resolves.toEqual({ ok: true });
    expect(asked).toEqual(["time-off.manage"]);

    expect(published).toEqual([
      {
        requestId: "req-new",
        teamMemberId: "tm-1",
        startDate: "2026-10-05",
        endDate: "2026-10-09",
        leaveType: "vacation",
        actorPersonId: "admin-person",
      },
    ]);
    expect(timeline().slice(-2)).toEqual(["time_off:insert", "publish:leave.approved"]);
    // Logging leave approves it: the admin who logged it is recorded as its decider on the approval (S.5 contract).
    expect(approvalWrites.at(-1)).toEqual(["decide", expect.objectContaining({ subjectType: "time_off", state: "approved", decidedBy: "admin-person" })]);
  });

  it("announces nothing when the insert is refused", async () => {
    script("time_off", { data: null }, { error: { message: "row level security" } });
    scriptApprover();
    script("holidays", { data: [] });

    await expect(createTimeOff(logged)).resolves.toEqual({
      ok: false,
      error: "row level security",
    });

    expect(published).toEqual([]);
  });
});

describe("decideTimeOff", () => {
  // Nobody decides their own leave except whoever leads the organisation: with
  // no manager above them there is nobody else to ask.
  it("refuses an admin deciding their own leave, and writes nothing", async () => {
    script("time_off", { data: request });
    script("team_members", { data: [{ id: "tm-1" }] }, { data: { manager_id: "tm-lead", status: "active" } });
    await expect(decideTimeOff("req-1", "approved")).resolves.toEqual({ ok: false, error: "Somebody else decides your leave." });
    expect(published).toEqual([]);
  });

  it("lets the admin who leads the organisation decide their own leave", async () => {
    script("time_off", { data: request }, LANDED);
    script("team_members", { data: [{ id: "tm-1" }] }, { data: { manager_id: null, status: "active" } });
    await expect(decideTimeOff("req-1", "approved")).resolves.toEqual({ ok: true });
    expect(published).toHaveLength(1);
  });

  it("announces the approval, and only after the row says approved", async () => {
    script("time_off", { data: request }, LANDED);
    scriptApprover();

    await expect(decideTimeOff("req-1", "approved")).resolves.toEqual({ ok: true });

    expect(published).toEqual([
      {
        requestId: "req-1",
        teamMemberId: "tm-1",
        startDate: "2026-10-05",
        endDate: "2026-10-09",
        leaveType: "annual",
        actorPersonId: "admin-person",
      },
    ]);
    // The write, then the fact. Announcing first would hand a subscriber a span
    // the database had not accepted yet.
    expect(timeline().slice(-2)).toEqual(["time_off:update", "publish:leave.approved"]);
    // The request's approval is settled with the deciding admin's name (S.5).
    expect(approvalWrites.at(-1)).toEqual(["decide", { subjectType: "time_off", subjectId: expect.any(String), state: "approved", decidedBy: "admin-person" }]);
  });

  it("announces nothing when the update is refused", async () => {
    // The reason the announcement sits after the write: coaching moving a 1-1
    // off a holiday nobody got is worse than coaching hearing nothing.
    script("time_off", { data: request }, { error: { message: "row level security" } });
    scriptApprover();

    await expect(decideTimeOff("req-1", "approved")).resolves.toEqual({
      ok: false,
      error: "row level security",
    });

    expect(published).toEqual([]);
    expect(timeline()).not.toContain("publish:leave.approved");
  });

  it("announces nothing on a denial", async () => {
    script("time_off", { data: request }, LANDED);
    scriptApprover();

    await expect(decideTimeOff("req-1", "rejected")).resolves.toEqual({ ok: true });

    expect(published).toEqual([]);
    expect(timeline()).toContain("time_off:update");
  });

  it("announces nothing when the transition is refused before any write", async () => {
    script("time_off", { data: { ...request, status: "taken" } });

    await expect(decideTimeOff("req-1", "approved")).resolves.toEqual({
      ok: false,
      error: "Only pending requests can be approved.",
    });

    expect(published).toEqual([]);
    expect(timeline()).toEqual(["time_off:select"]);
  });
});

// S.19. A failed lookup of who the admin is used to answer "not a team member",
// which switched the self-decision check off; and a decision raced by another
// used to settle twice.
describe("decideTimeOff when the ground moves", () => {
  it("refuses, writing nothing, when it cannot tell who the admin is", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    personIdForEmail.mockRejectedValueOnce(new Error("read failed: people by email"));
    script("time_off", { data: request });
    await expect(decideTimeOff("req-1", "approved")).resolves.toEqual({
      ok: false,
      error: "Could not check who you are, so nothing was changed. Try again.",
    });
    expect(timeline()).not.toContain("time_off:update");
    expect(published).toEqual([]);
  });

  it("refuses, settling and announcing nothing, when the request changed under it", async () => {
    script("time_off", { data: request }, { data: [] });
    scriptApprover();
    const before = approvalWrites.length;
    await expect(decideTimeOff("req-1", "approved")).resolves.toEqual({
      ok: false,
      error: "This request changed while you were deciding. Reload and try again.",
    });
    expect(published).toEqual([]);
    expect(approvalWrites).toHaveLength(before);
  });
});

// A.30. The two admin moves that take an approval back. Neither was tested at
// the action before: the override left two approval rows behind it, and the
// cancel left the approval reading "approved" with nothing on the bus.
describe("taking back approved leave", () => {
  const approved = { ...request, status: "approved" };

  it("denies approved leave: the denial is decided, and the leave is said to be withdrawn", async () => {
    script("time_off", { data: approved }, LANDED);
    scriptApprover();
    await expect(decideTimeOff("req-1", "rejected")).resolves.toEqual({ ok: true });
    expect(approvalWrites.at(-1)).toEqual(["decide", expect.objectContaining({ subjectId: "req-1", state: "rejected", decidedBy: "admin-person" })]);
    expect(published).toEqual([]);
    expect(withdrawn).toEqual([expect.objectContaining({ requestId: "req-1", became: "rejected", actorPersonId: "admin-person" })]);
  });

  it("cancels approved leave, guarded on the status read, and says it was withdrawn", async () => {
    script("time_off", { data: approved }, LANDED);
    scriptApprover();
    await expect(cancelTimeOff("req-1")).resolves.toEqual({ ok: true });
    expect(approvalWrites.at(-1)).toEqual(["cancel", expect.objectContaining({ subjectId: "req-1", cancelledBy: "admin-person" })]);
    expect(withdrawn).toEqual([expect.objectContaining({ requestId: "req-1", became: "cancelled" })]);
  });

  it("still cancels when it cannot tell who the admin is, naming nobody", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    personIdForEmail.mockRejectedValueOnce(new Error("read failed: people by email"));
    script("time_off", { data: approved }, LANDED);
    await expect(cancelTimeOff("req-1")).resolves.toEqual({ ok: true });
    expect(approvalWrites.at(-1)).toEqual(["cancel", expect.objectContaining({ cancelledBy: null })]);
  });
});
