import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import { ReadFailure } from "@/kernel/data/read";

// CR.5.5: the routine that sends a scheduled member email once its time has
// come and the due-date reminder three working days before the due date. Each
// send is claimed on the cycle before any email goes, so two runs at once send
// once; nothing goes outside the client's working day; only team members are
// mailed (the notices are the only senders, and they read team_members).
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const h = vi.hoisted(() => ({
  audit: vi.fn(async (_entry: unknown) => {}),
  open: vi.fn(async (ids: readonly string[], _cycle: unknown) => ({ sent: ids.length, addressed: ids.length as number | null })),
  waiting: vi.fn(async (ids: readonly string[], _cycle: unknown) => ({ sent: ids.length, addressed: ids.length as number | null })),
}));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: h.audit }));
vi.mock("./notices", () => ({ emailMembersTheirClientReviewIsOpen: h.open, emailMembersTheirReviewIsWaiting: h.waiting }));

import { sendDueMemberEmails } from "./member-email-scheduler";

const CYCLE = "11111111-1111-4111-8111-111111111111";
// Tuesday 1 December 2026, 10:00 am in New York: inside the client's day, and
// the reminder day for a cycle due Friday 4 December.
const NOW = new Date("2026-12-01T15:00:00Z");
// The same Tuesday at 7:00 am in New York, before the client's day starts.
const EARLY = new Date("2026-12-01T12:00:00Z");
const NORTHWIND = { name: "Northwind", time_zone: "America/New_York", working_day_start: null };
const scheduled = (over: Record<string, unknown> = {}) => ({
  id: CYCLE,
  name: "November 2026",
  due_date: "2026-12-04",
  member_email_mode: "scheduled",
  member_email_scheduled_at: "2026-12-01T14:00:00+00:00",
  member_email_sent_at: null,
  companies: NORTHWIND,
  ...over,
});
const emailed = (over: Record<string, unknown> = {}) => scheduled({ member_email_mode: "now", member_email_scheduled_at: null, member_email_sent_at: "2026-11-18T15:00:00Z", ...over });
const cycleCalls = () => calls.filter((c) => c.table === "review_cycles");
const updates = () => cycleCalls().filter((c) => c.ops.includes("update"));
const members = () => {
  script("review_cycle_members", { data: [{ team_member_id: "tm-1" }, { team_member_id: "tm-2" }, { team_member_id: "tm-3" }] });
  // tm-3 has sent theirs, so it is not asked again.
  script("performance_reviews", { data: [{ team_member_id: "tm-1", status: "pending" }, { team_member_id: "tm-3", status: "submitted" }] });
};

beforeEach(() => {
  resetFake();
  h.audit.mockClear();
  h.open.mockClear();
  h.waiting.mockClear();
});

describe("a scheduled email", () => {
  it("claims the cycle, then emails the members still to send theirs, once", async () => {
    script("review_cycles", { data: [scheduled()] }, { data: [{ id: CYCLE }] }, { data: [] });
    members();
    let claimedBeforeMail = false;
    h.open.mockImplementationOnce(async (ids) => {
      claimedBeforeMail = updates().length === 1 && updates()[0].resolvedAt !== null;
      return { sent: ids.length, addressed: ids.length };
    });
    const run = await sendDueMemberEmails(NOW);
    expect(run).toMatchObject({ scheduledCycles: 1, scheduledEmails: 2, reminderCycles: 0, held: 0, outcome: { expected: 2, done: 2, unit: "emails" }, failures: [] });
    expect(claimedBeforeMail).toBe(true);
    // The read asks only for open cycles whose moment has come and that no run sent.
    expect(cycleCalls()[0].filters).toEqual(
      expect.arrayContaining([
        ["is", "closed_at", null],
        ["eq", "member_email_mode", "scheduled"],
        ["is", "member_email_sent_at", null],
        ["lte", "member_email_scheduled_at", NOW.toISOString()],
      ]),
    );
    const [claim] = updates();
    expect(claim.payloads[0]).toEqual({ member_email_sent_at: NOW.toISOString() });
    expect(claim.filters).toEqual(
      expect.arrayContaining([
        ["eq", "id", CYCLE],
        ["is", "closed_at", null],
        ["eq", "member_email_mode", "scheduled"],
        ["eq", "member_email_scheduled_at", "2026-12-01T14:00:00+00:00"],
        ["is", "member_email_sent_at", null],
      ]),
    );
    // A withdrawn member is never asked.
    expect(calls.find((c) => c.table === "review_cycle_members")?.filters).toContainEqual(["is", "withdrawn_at", null]);
    expect(h.open).toHaveBeenCalledWith(["tm-1", "tm-2"], { clientName: "Northwind", cycleName: "November 2026", dueDate: "2026-12-04" });
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ table: "review_cycles", recordId: CYCLE, actor: "routine:client-review-emails", context: expect.objectContaining({ action: "member_email_sent", sent: 2, of: 2 }) }));
  });

  it("sends nothing when another run claimed the cycle first", async () => {
    script("review_cycles", { data: [scheduled()] }, { data: [] }, { data: [] });
    members();
    const run = await sendDueMemberEmails(NOW);
    expect(h.open).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
    expect(run).toMatchObject({ scheduledCycles: 0, outcome: { expected: 0, done: 0 }, failures: [] });
  });

  it("waits, outside the client's working day, for a run inside it", async () => {
    script("review_cycles", { data: [scheduled()] }, { data: [] });
    const run = await sendDueMemberEmails(EARLY);
    expect(run.held).toBe(1);
    expect(updates()).toEqual([]);
    expect(h.open).not.toHaveBeenCalled();
  });

  it("keeps to Saigon's working hours when the client has no zone", async () => {
    // 10:00 am in New York is 10:00 pm in Saigon, so it is held.
    script("review_cycles", { data: [scheduled({ companies: { name: "Northwind", time_zone: null, working_day_start: null } })] }, { data: [] });
    expect((await sendDueMemberEmails(NOW)).held).toBe(1);
    expect(h.open).not.toHaveBeenCalled();
  });

  it("puts the claim back when sends were tried and not one went, so the next run tries again, and says so", async () => {
    script("review_cycles", { data: [scheduled()] }, { data: [{ id: CYCLE }] }, { data: [{ id: CYCLE }] }, { data: [] });
    members();
    h.open.mockImplementationOnce(async () => ({ sent: 0, addressed: 2 }));
    const run = await sendDueMemberEmails(NOW);
    const back = updates()[1];
    expect(back.payloads[0]).toEqual({ member_email_sent_at: null });
    // Only this run's own claim is undone.
    expect(back.filters).toEqual(expect.arrayContaining([["eq", "id", CYCLE], ["eq", "member_email_sent_at", NOW.toISOString()]]));
    expect(run.failures).toEqual([{ subject: CYCLE, step: "send scheduled email", error: "no email went; the next run tries again" }]);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("keeps the claim when no waiting member has an address, and records it once rather than retrying every run", async () => {
    script("review_cycles", { data: [scheduled()] }, { data: [{ id: CYCLE }] }, { data: [] });
    members();
    h.open.mockImplementationOnce(async () => ({ sent: 0, addressed: 0 }));
    const run = await sendDueMemberEmails(NOW);
    // The claim is the only write: nothing puts it back, so the next run does not find the cycle.
    expect(updates()).toHaveLength(1);
    expect(updates()[0].payloads[0]).toEqual({ member_email_sent_at: NOW.toISOString() });
    expect(run.failures).toEqual([
      { subject: CYCLE, step: "send scheduled email", error: "none of the 2 members waiting has an email address, so no email went; it is not retried" },
    ]);
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ table: "review_cycles", recordId: CYCLE, context: expect.objectContaining({ action: "member_email_unaddressed", waiting: 2 }) }));
  });

  it("puts the claim back when the addresses could not be read", async () => {
    script("review_cycles", { data: [scheduled()] }, { data: [{ id: CYCLE }] }, { data: [{ id: CYCLE }] }, { data: [] });
    members();
    h.open.mockImplementationOnce(async () => ({ sent: 0, addressed: null }));
    const run = await sendDueMemberEmails(NOW);
    expect(updates()[1].payloads[0]).toEqual({ member_email_sent_at: null });
    expect(run.failures).toEqual([{ subject: CYCLE, step: "send scheduled email", error: "no email went; the next run tries again" }]);
  });

  it("raises when the cycles cannot be read, rather than reading as nothing to send", async () => {
    script("review_cycles", { error: { message: "connection reset" } });
    await expect(sendDueMemberEmails(NOW)).rejects.toBeInstanceOf(ReadFailure);
  });
});

describe("the due-date reminder", () => {
  it("reminds the members who have not sent theirs on the reminder day, once", async () => {
    script("review_cycles", { data: [] }, { data: [emailed()] }, { data: [{ id: CYCLE }] });
    members();
    const run = await sendDueMemberEmails(NOW);
    expect(run).toMatchObject({ reminderCycles: 1, reminderEmails: 2, outcome: { expected: 2, done: 2 }, failures: [] });
    // Only cycles the app emailed, with a due date, open, and not reminded yet.
    expect(cycleCalls()[1].filters).toEqual(
      expect.arrayContaining([
        ["is", "closed_at", null],
        ["in", "member_email_mode", ["now", "scheduled"]],
        ["not", "member_email_sent_at", "is", null],
        ["not", "due_date", "is", null],
        ["is", "member_reminder_sent_at", null],
      ]),
    );
    const [claim] = updates();
    expect(claim.payloads[0]).toEqual({ member_reminder_sent_at: NOW.toISOString() });
    expect(claim.filters).toEqual(
      expect.arrayContaining([
        ["eq", "id", CYCLE],
        ["is", "closed_at", null],
        ["eq", "member_email_mode", "now"],
        ["eq", "due_date", "2026-12-04"],
        ["is", "member_reminder_sent_at", null],
      ]),
    );
    expect(h.waiting).toHaveBeenCalledWith(["tm-1", "tm-2"], { clientName: "Northwind", cycleName: "November 2026", dueDate: "2026-12-04" });
    expect(h.open).not.toHaveBeenCalled();
  });

  it("does not go before the reminder day", async () => {
    script("review_cycles", { data: [] }, { data: [emailed()] });
    await sendDueMemberEmails(new Date("2026-11-30T15:00:00Z"));
    expect(updates()).toEqual([]);
    expect(h.waiting).not.toHaveBeenCalled();
  });

  it("sends nothing when another run reminded the cycle first", async () => {
    script("review_cycles", { data: [] }, { data: [emailed()] }, { data: [] });
    members();
    await sendDueMemberEmails(NOW);
    expect(h.waiting).not.toHaveBeenCalled();
  });

  it("keeps the claim and mails nobody when everyone has sent theirs", async () => {
    script("review_cycles", { data: [] }, { data: [emailed()] }, { data: [{ id: CYCLE }] });
    script("review_cycle_members", { data: [{ team_member_id: "tm-3" }] });
    script("performance_reviews", { data: [{ team_member_id: "tm-3", status: "submitted" }] });
    const run = await sendDueMemberEmails(NOW);
    expect(h.waiting).not.toHaveBeenCalled();
    expect(updates()).toHaveLength(1);
    expect(run).toMatchObject({ reminderCycles: 1, reminderEmails: 0, failures: [] });
  });

  it("keeps the claim when no waiting member has an address, and records it once rather than retrying every run", async () => {
    script("review_cycles", { data: [] }, { data: [emailed()] }, { data: [{ id: CYCLE }] });
    members();
    h.waiting.mockImplementationOnce(async () => ({ sent: 0, addressed: 0 }));
    const run = await sendDueMemberEmails(NOW);
    expect(updates()).toHaveLength(1);
    expect(updates()[0].payloads[0]).toEqual({ member_reminder_sent_at: NOW.toISOString() });
    expect(run.failures).toEqual([{ subject: CYCLE, step: "send reminder", error: "none of the 2 members waiting has an email address, so no email went; it is not retried" }]);
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ action: "member_reminder_unaddressed", waiting: 2 }) }));
  });

  it("puts the claim back when sends were tried and not one went", async () => {
    script("review_cycles", { data: [] }, { data: [emailed()] }, { data: [{ id: CYCLE }] }, { data: [{ id: CYCLE }] });
    members();
    h.waiting.mockImplementationOnce(async () => ({ sent: 0, addressed: 2 }));
    const run = await sendDueMemberEmails(NOW);
    expect(updates()[1].payloads[0]).toEqual({ member_reminder_sent_at: null });
    expect(updates()[1].filters).toEqual(expect.arrayContaining([["eq", "id", CYCLE], ["eq", "member_reminder_sent_at", NOW.toISOString()]]));
    expect(run.failures).toEqual([{ subject: CYCLE, step: "send reminder", error: "no email went; the next run tries again" }]);
    expect(h.audit).not.toHaveBeenCalled();
  });
});

describe("a dry run", () => {
  it("counts what would go, and claims and sends nothing", async () => {
    script("review_cycles", { data: [scheduled()] }, { data: [emailed()] });
    members();
    members();
    const run = await sendDueMemberEmails(NOW, { dryRun: true });
    expect(run).toMatchObject({ scheduledCycles: 1, scheduledEmails: 2, reminderCycles: 1, reminderEmails: 2 });
    expect(updates()).toEqual([]);
    expect(h.open).not.toHaveBeenCalled();
    expect(h.waiting).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });
});
