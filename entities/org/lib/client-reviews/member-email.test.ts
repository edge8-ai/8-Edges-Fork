import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// CR.5.4: the owner's choice of how the members are emailed. Each write is a
// compare-and-set on the plan the overview showed; "now" emails at once only
// inside the client's working day; manual and "Don't send it" clear the
// reminder in the same write, which the database's check requires.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const h = vi.hoisted(() => ({
  audit: vi.fn(async (_entry: unknown) => {}),
  mail: vi.fn(async (ids: readonly string[], _cycle: unknown) => ({ sent: ids.length, addressed: ids.length as number | null })),
}));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: h.audit }));
vi.mock("./notices", () => ({ emailMembersTheirClientReviewIsOpen: h.mail }));

import { chooseMemberEmail, clearMemberEmail, markMemberEmailSent } from "./member-email";

const CYCLE = "11111111-1111-4111-8111-111111111111";
const BY = { personId: "person-owner", email: "owner@example.com" };
const NONE = { mode: null, scheduledAt: null };
// Tuesday 17 November 2026: 10:00 am in New York, and 7:00 pm there.
const INSIDE = new Date("2026-11-17T15:00:00Z");
const OUTSIDE = new Date("2026-11-18T00:00:00Z");
const cycle = (over: Record<string, unknown> = {}) => ({
  id: CYCLE,
  name: "November 2026",
  closed_at: null,
  due_date: "2026-12-04",
  member_email_mode: null,
  member_email_scheduled_at: null,
  member_email_sent_at: null,
  member_email_manual_marked_sent_at: null,
  companies: { name: "Northwind", time_zone: "America/New_York", working_day_start: null },
  ...over,
});
const updates = () => calls.filter((c) => c.table === "review_cycles" && c.ops.includes("update"));
const members = () => {
  script("review_cycle_members", { data: [{ team_member_id: "tm-1" }, { team_member_id: "tm-2" }, { team_member_id: "tm-3" }] });
  // tm-3 has sent theirs, so it is not asked again.
  script("performance_reviews", { data: [{ team_member_id: "tm-1", status: "pending" }, { team_member_id: "tm-3", status: "submitted" }] });
};

beforeEach(() => {
  resetFake();
  h.audit.mockClear();
  h.mail.mockClear();
});

describe("Email them now", () => {
  it("inside the client's day, claims the plan, then emails the members still to send theirs", async () => {
    script("review_cycles", { data: [cycle()] }, { data: [{ id: CYCLE }] });
    members();
    let claimedBeforeMail = false;
    h.mail.mockImplementationOnce(async (ids) => {
      claimedBeforeMail = updates().length === 1 && updates()[0].resolvedAt !== null;
      return { sent: ids.length, addressed: ids.length };
    });
    expect(await chooseMemberEmail(CYCLE, { how: "now" }, NONE, BY, INSIDE)).toEqual({ ok: true, outcome: "sent", sent: 2, of: 2 });
    // The claim resolved before any email went: at most once.
    expect(claimedBeforeMail).toBe(true);
    const [claim] = updates();
    expect(claim.payloads[0]).toEqual({ member_email_mode: "now", member_email_sent_at: INSIDE.toISOString(), member_email_scheduled_at: null });
    // The claim lands only on the plan the page showed, still unsent, on an open cycle.
    expect(claim.filters).toEqual(
      expect.arrayContaining([
        ["eq", "id", CYCLE],
        ["is", "closed_at", null],
        ["is", "member_email_sent_at", null],
        ["is", "member_email_mode", null],
      ]),
    );
    expect(h.mail).toHaveBeenCalledWith(["tm-1", "tm-2"], { clientName: "Northwind", cycleName: "November 2026", dueDate: "2026-12-04" });
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ table: "review_cycles", recordId: CYCLE, context: expect.objectContaining({ action: "member_email_sent", sent: 2, of: 2, byPersonId: "person-owner" }) }));
  });

  it("outside the client's day, emails nobody and schedules it for the next start", async () => {
    script("review_cycles", { data: [cycle()] }, { data: [{ id: CYCLE }] });
    expect(await chooseMemberEmail(CYCLE, { how: "now" }, NONE, BY, OUTSIDE)).toEqual({ ok: true, outcome: "scheduled", at: "2026-11-18T14:00:00.000Z", moved: true });
    expect(updates()[0].payloads[0]).toEqual({ member_email_mode: "scheduled", member_email_scheduled_at: "2026-11-18T14:00:00.000Z" });
    expect(h.mail).not.toHaveBeenCalled();
  });

  it("sends nothing when another tab changed the plan first", async () => {
    script("review_cycles", { data: [cycle()] }, { data: [] });
    members();
    expect(await chooseMemberEmail(CYCLE, { how: "now" }, NONE, BY, INSIDE)).toEqual({ ok: false, error: "The email plan changed just now. Reload to see it." });
    expect(h.mail).not.toHaveBeenCalled();
  });

  it("puts the claim back when not one email went", async () => {
    h.mail.mockResolvedValueOnce({ sent: 0, addressed: 2 });
    script("review_cycles", { data: [cycle()] }, { data: [{ id: CYCLE }] }, { data: [{ id: CYCLE }] });
    members();
    expect(await chooseMemberEmail(CYCLE, { how: "now" }, NONE, BY, INSIDE)).toEqual({ ok: false, error: "No email could be sent. Nothing was recorded, so you can try again." });
    const back = updates()[1];
    expect(back.payloads[0]).toEqual({ member_email_mode: null, member_email_scheduled_at: null, member_email_sent_at: null });
    expect(back.filters).toEqual(expect.arrayContaining([["eq", "member_email_sent_at", INSIDE.toISOString()]]));
  });

  it("refuses once the members were emailed, on a closed cycle, or with nobody left to email", async () => {
    script("review_cycles", { data: [cycle({ member_email_mode: "now", member_email_sent_at: "2026-11-17T15:00:00Z" })] }, { data: [cycle({ closed_at: "2026-12-10T00:00:00Z" })] }, { data: [cycle()] });
    expect(await chooseMemberEmail(CYCLE, { how: "now" }, { mode: "now", scheduledAt: null }, BY, INSIDE)).toEqual({ ok: false, error: "The members were already emailed." });
    expect(await chooseMemberEmail(CYCLE, { how: "now" }, NONE, BY, INSIDE)).toEqual({ ok: false, error: "This cycle is closed, so its members are not emailed." });
    script("review_cycle_members", { data: [{ team_member_id: "tm-3" }] });
    script("performance_reviews", { data: [{ team_member_id: "tm-3", status: "submitted" }] });
    expect(await chooseMemberEmail(CYCLE, { how: "now" }, NONE, BY, INSIDE)).toEqual({ ok: false, error: "Everyone has sent theirs, so there is nobody to email." });
    expect(updates()).toEqual([]);
  });
});

describe("Email them on a date", () => {
  it("stores the instant a blank time resolves to: the client's day start, in its zone", async () => {
    script("review_cycles", { data: [cycle()] }, { data: [{ id: CYCLE }] });
    expect(await chooseMemberEmail(CYCLE, { how: "scheduled", date: "2026-11-18", time: null }, NONE, BY, INSIDE)).toEqual({ ok: true, outcome: "scheduled", at: "2026-11-18T14:00:00.000Z", moved: false });
    expect(updates()[0].payloads[0]).toEqual({ member_email_mode: "scheduled", member_email_scheduled_at: "2026-11-18T14:00:00.000Z" });
  });

  it("changes a schedule only while it is the one the page showed", async () => {
    const shown = { mode: "scheduled" as const, scheduledAt: "2026-11-18T14:00:00+00:00" };
    script("review_cycles", { data: [cycle({ member_email_mode: "scheduled", member_email_scheduled_at: "2026-11-18T14:00:00+00:00" })] }, { data: [{ id: CYCLE }] });
    expect(await chooseMemberEmail(CYCLE, { how: "scheduled", date: "2026-11-19", time: "10:30" }, shown, BY, INSIDE)).toMatchObject({ ok: true, at: "2026-11-19T15:30:00.000Z" });
    expect(updates()[0].filters).toEqual(expect.arrayContaining([["eq", "member_email_mode", "scheduled"], ["eq", "member_email_scheduled_at", "2026-11-18T14:00:00+00:00"]]));
  });

  it("refuses a stale page before writing", async () => {
    script("review_cycles", { data: [cycle({ member_email_mode: "manual" })] });
    expect(await chooseMemberEmail(CYCLE, { how: "scheduled", date: "2026-11-18", time: null }, NONE, BY, INSIDE)).toEqual({ ok: false, error: "The email plan changed just now. Reload to see it." });
    expect(updates()).toEqual([]);
  });

  it("refuses a client with no time zone, with what to do", async () => {
    script("review_cycles", { data: [cycle({ companies: { name: "Northwind", time_zone: null, working_day_start: null } })] });
    expect(await chooseMemberEmail(CYCLE, { how: "scheduled", date: "2026-11-18", time: null }, NONE, BY, INSIDE)).toEqual({
      ok: false,
      error: "Northwind has no time zone yet, so a time at Northwind cannot be worked out. Set it on Northwind's page first.",
    });
    expect(updates()).toEqual([]);
  });
});

describe("I'll email them myself, Don't send it, Mark as sent", () => {
  it("manual stores that the app sends nothing and clears the reminder in the same write", async () => {
    const shown = { mode: "scheduled" as const, scheduledAt: "2026-11-18T14:00:00Z" };
    script("review_cycles", { data: [cycle({ member_email_mode: "scheduled", member_email_scheduled_at: "2026-11-18T14:00:00Z" })] }, { data: [{ id: CYCLE }] });
    expect(await chooseMemberEmail(CYCLE, { how: "manual" }, shown, BY, INSIDE)).toEqual({ ok: true, outcome: "saved" });
    expect(updates()[0].payloads[0]).toEqual({ member_email_mode: "manual", member_email_scheduled_at: null, member_reminder_sent_at: null });
    expect(h.mail).not.toHaveBeenCalled();
  });

  it("Don't send it goes back to not chosen, clearing the reminder too", async () => {
    const shown = { mode: "scheduled" as const, scheduledAt: "2026-11-18T14:00:00Z" };
    script("review_cycles", { data: [cycle({ member_email_mode: "scheduled", member_email_scheduled_at: "2026-11-18T14:00:00Z" })] }, { data: [{ id: CYCLE }] });
    expect(await clearMemberEmail(CYCLE, shown, BY)).toEqual({ ok: true, outcome: "saved" });
    expect(updates()[0].payloads[0]).toEqual({ member_email_mode: null, member_email_scheduled_at: null, member_reminder_sent_at: null });
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ action: "member_email_plan_cleared", was: "scheduled" }) }));
  });

  it("Mark as sent records when, only for the manual plan, once", async () => {
    const now = new Date("2026-11-17T09:00:00Z");
    script("review_cycles", { data: [cycle({ member_email_mode: "manual" })] }, { data: [{ id: CYCLE }] }, { data: [cycle({ member_email_mode: "manual", member_email_manual_marked_sent_at: "2026-11-17T09:00:00Z" })] }, { data: [cycle()] });
    expect(await markMemberEmailSent(CYCLE, BY, now)).toEqual({ ok: true, outcome: "saved" });
    expect(updates()[0].payloads[0]).toEqual({ member_email_manual_marked_sent_at: now.toISOString() });
    expect(updates()[0].filters).toEqual(expect.arrayContaining([["eq", "member_email_mode", "manual"], ["is", "member_email_manual_marked_sent_at", null]]));
    expect(await markMemberEmailSent(CYCLE, BY, now)).toEqual({ ok: false, error: "You already marked the email as sent." });
    expect(await markMemberEmailSent(CYCLE, BY, now)).toEqual({ ok: false, error: "The email plan changed just now. Reload to see it." });
    expect(updates()).toHaveLength(1);
  });
});
