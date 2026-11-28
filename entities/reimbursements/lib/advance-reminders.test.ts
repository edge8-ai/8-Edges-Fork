import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// What goes out, to whom and how often. The promises: one of each however often the cron
// runs, none while a settlement is being checked, and a failed calendar costs a reminder but
// never an overdue notice.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const calendar = vi.hoisted(() => ({ fails: false, days: [] as { date: string; name: string }[] }));
vi.mock("@/entities/time-off", () => ({
  holidayCalendar: async () => {
    if (calendar.fails) throw new Error("calendar down");
    return calendar.days;
  },
}));
const told = vi.hoisted(() => [] as { what: string; id: string; key: unknown }[]);
const owedSaid = vi.hoisted(() => [] as unknown[]);
const delivered = vi.hoisted(() => ({ ok: true }));
vi.mock("./advance-notices", () => ({
  tellOwnerOfDeadline: async (a: { advanceId: string; eventId: unknown; owedVnd?: unknown }) => (owedSaid.push(a.owedVnd), told.push({ what: "reminder", id: a.advanceId, key: a.eventId }), delivered.ok),
  tellOfOverdue: async (a: { advanceId: string; eventId: unknown; owedVnd?: unknown }) => (owedSaid.push(a.owedVnd), told.push({ what: "overdue", id: a.advanceId, key: a.eventId }), delivered.ok),
}));

import { dueToday, sendAdvanceReminders } from "./advance-reminders";

const held = (over: Record<string, unknown> = {}) => ({ id: "advance-1", ref_no: 7, person_id: "person-a", purpose: "Venue", amount_vnd: 8_000_000, settle_by: "2026-11-30", reminded_at: null, overdue_told_at: null, ...over });
const writes = () => calls.filter((c) => c.table === "reimbursement_advances" && c.ops[0] === "update");
const clean = { settleBy: "2026-11-30", remindedAt: null, overdueToldAt: null, claimStatus: null };

beforeEach(() => {
  resetFake();
  told.length = 0;
  owedSaid.length = 0;
  calendar.fails = false;
  delivered.ok = true;
  calendar.days = [];
});

describe("dueToday", () => {
  it("keeps the date for money owed because none was spent", () => {
    expect(dueToday({ ...clean, status: "to_return" }, "2026-12-01", [])).toBe("overdue");
    expect(dueToday({ ...clean, status: "to_return" }, "2026-11-25", [])).toBe("reminder");
  });

  it("asks nothing more of a settlement that closed owing: the close already asked, and the date may have passed in review", () => {
    expect(dueToday({ ...clean, status: "to_return", claimStatus: "approved" }, "2026-12-01", [])).toBeNull();
    expect(dueToday({ ...clean, status: "to_return", claimStatus: "approved" }, "2026-11-25", [])).toBeNull();
  });

  it("reminds three working days before the date, and not the day before that", () => {
    // 30 Nov 2026 is a Monday; three working days back is Wednesday 25 Nov.
    expect(dueToday(clean, "2026-11-24", [])).toBeNull();
    expect(dueToday(clean, "2026-11-25", [])).toBe("reminder");
  });

  it("still reminds a later run that missed the day, up to the date itself", () => {
    expect(dueToday(clean, "2026-11-30", [])).toBe("reminder");
  });

  it("counts a holiday, so the reminder never lands late", () => {
    expect(dueToday(clean, "2026-11-24", [{ date: "2026-11-26", name: "Culture Day" }])).toBe("reminder");
  });

  it("reminds once", () => {
    expect(dueToday({ ...clean, remindedAt: "t" }, "2026-11-25", [])).toBeNull();
  });

  it("is overdue the day after the date, whether or not the reminder went, and says so once", () => {
    expect(dueToday(clean, "2026-12-01", [])).toBe("overdue");
    expect(dueToday({ ...clean, remindedAt: "t" }, "2026-12-01", [])).toBe("overdue");
    expect(dueToday({ ...clean, overdueToldAt: "t" }, "2026-12-01", [])).toBeNull();
  });

  it.each(["submitted", "checked"])("says nothing while its settlement is %s: the person has done their part", (claimStatus) => {
    expect(dueToday({ ...clean, claimStatus }, "2026-11-25", [])).toBeNull();
    expect(dueToday({ ...clean, claimStatus }, "2026-12-01", [])).toBeNull();
  });

  it("still chases one whose settlement was sent back, or only started", () => {
    expect(dueToday({ ...clean, claimStatus: "sent_back" }, "2026-12-01", [])).toBe("overdue");
    expect(dueToday({ ...clean, claimStatus: "draft" }, "2026-11-25", [])).toBe("reminder");
  });

  it("holds a reminder without a calendar, and does not hold an overdue notice", () => {
    expect(dueToday(clean, "2026-11-25", null)).toBeNull();
    expect(dueToday(clean, "2026-12-01", null)).toBe("overdue");
  });
});

describe("sendAdvanceReminders", () => {
  it("reads only advances with money out", async () => {
    script("reimbursement_advances", { data: [] });
    expect(await sendAdvanceReminders("2026-11-25")).toEqual({ reminded: 0, overdue: 0, failed: [] });
    expect(calls[0].filters).toEqual(expect.arrayContaining([["in", "status", ["paid_out", "to_return"]]]));
  });

  it("claims first, on the advance still being held, then tells, with a key that survives a retry", async () => {
    script("reimbursement_advances", { data: [held()] }, { data: [{ id: "advance-1" }] });
    script("reimbursement_claims", { data: [] });
    expect(await sendAdvanceReminders("2026-11-25")).toEqual({ reminded: 1, overdue: 0, failed: [] });
    expect(writes()[0].filters).toEqual(expect.arrayContaining([["in", "status", ["paid_out", "to_return"]], ["is", "reminded_at", null]]));
    expect(writes()[0].payloads[0]).toHaveProperty("reminded_at");
    expect(told).toEqual([{ what: "reminder", id: "advance-1", key: "reminder" }]);
  });

  describe("money owed back", () => {
    const owing = (over: Record<string, unknown> = {}) => held({ status: "to_return", balance_vnd: -8_000_000, metadata: {}, ...over });

    it("says what is still owed, under a key of its own so an earlier notice's key cannot swallow it", async () => {
      script("reimbursement_advances", { data: [owing()] }, { data: [{ id: "advance-1" }] });
      script("reimbursement_claims", { data: [] });
      script("reimbursement_advance_transfers", { data: [{ advance_id: "advance-1", amount_vnd: 3_000_000 }] });
      expect(await sendAdvanceReminders("2026-12-01")).toEqual({ reminded: 0, overdue: 1, failed: [] });
      expect(owedSaid).toEqual([5_000_000]);
      expect(told[0].key).toBe("overdue-back");
    });

    it("leaves alone someone who said they sent it, until a transfer answers that", async () => {
      const said = { metadata: { returnReportedAt: "t", returnReportedAtVnd: 0 } };
      script("reimbursement_advances", { data: [owing(said)] });
      script("reimbursement_claims", { data: [] });
      script("reimbursement_advance_transfers", { data: [] });
      expect(await sendAdvanceReminders("2026-12-01")).toEqual({ reminded: 0, overdue: 0, failed: [] });
      expect(writes()).toEqual([]);
    });

    it("tells nobody when nothing is left, which is a status write that was lost", async () => {
      script("reimbursement_advances", { data: [owing()] });
      script("reimbursement_claims", { data: [] });
      script("reimbursement_advance_transfers", { data: [{ advance_id: "advance-1", amount_vnd: 8_000_000 }] });
      expect(await sendAdvanceReminders("2026-12-01")).toEqual({ reminded: 0, overdue: 0, failed: [] });
      expect(told).toEqual([]);
    });
  });

  it("sends nothing when another run won the claim", async () => {
    script("reimbursement_advances", { data: [held()] }, { data: [] });
    script("reimbursement_claims", { data: [] });
    expect(await sendAdvanceReminders("2026-11-25")).toEqual({ reminded: 0, overdue: 0, failed: [] });
    expect(told).toEqual([]);
  });

  it("tells of one overdue, claiming its own stamp", async () => {
    script("reimbursement_advances", { data: [held({ reminded_at: "t" })] }, { data: [{ id: "advance-1" }] });
    script("reimbursement_claims", { data: [] });
    expect(await sendAdvanceReminders("2026-12-01")).toEqual({ reminded: 0, overdue: 1, failed: [] });
    expect(writes()[0].payloads[0]).toHaveProperty("overdue_told_at");
    expect(told[0].what).toBe("overdue");
  });

  it("leaves one whose settlement is being checked", async () => {
    script("reimbursement_advances", { data: [held()] });
    script("reimbursement_claims", { data: [{ advance_id: "advance-1", status: "submitted" }] });
    expect(await sendAdvanceReminders("2026-12-01")).toEqual({ reminded: 0, overdue: 0, failed: [] });
    expect(writes()).toEqual([]);
  });

  it("names a calendar it could not read, sends no reminder, and still tells of what is overdue", async () => {
    calendar.fails = true;
    script("reimbursement_advances", { data: [held(), held({ id: "advance-2", settle_by: "2026-11-01" })] }, { data: [{ id: "advance-2" }] });
    script("reimbursement_claims", { data: [] });
    const report = await sendAdvanceReminders("2026-11-25");
    expect(report.failed).toEqual(["the holiday calendar: calendar down"]);
    expect(told).toEqual([{ what: "overdue", id: "advance-2", key: "overdue" }]);
  });

  // The stamp is already spent, so it is never retried: this line is the only trace of it.
  it("names a reminder that did not reach its owner, and does not count it as sent", async () => {
    delivered.ok = false;
    script("reimbursement_advances", { data: [held()] }, { data: [{ id: "advance-1" }] });
    script("reimbursement_claims", { data: [] });
    expect(await sendAdvanceReminders("2026-11-25")).toEqual({ reminded: 0, overdue: 0, failed: ["advance advance-1: the reminder did not reach its owner"] });
  });

  it("names an overdue notice that did not reach everyone, and does not count it as sent", async () => {
    delivered.ok = false;
    script("reimbursement_advances", { data: [held()] }, { data: [{ id: "advance-1" }] });
    script("reimbursement_claims", { data: [] });
    expect(await sendAdvanceReminders("2026-12-01")).toEqual({ reminded: 0, overdue: 0, failed: ["advance advance-1: the overdue notice did not reach everyone"] });
  });

  it("names one it could not claim and goes on to the next", async () => {
    script("reimbursement_advances", { data: [held(), held({ id: "advance-2" })] }, { data: null, error: { message: "refused" } }, { data: [{ id: "advance-2" }] });
    script("reimbursement_claims", { data: [] });
    const report = await sendAdvanceReminders("2026-11-25");
    expect(report).toMatchObject({ reminded: 1, failed: ["advance advance-1: refused"] });
  });

  it("raises when the advances cannot be read, rather than saying nobody is due", async () => {
    script("reimbursement_advances", { data: null, error: { message: "down" } });
    await expect(sendAdvanceReminders("2026-11-25")).rejects.toThrow("down");
  });

  it("raises when the settlements cannot be read, rather than chasing someone waiting on us", async () => {
    script("reimbursement_advances", { data: [held()] });
    script("reimbursement_claims", { data: null, error: { message: "down" } });
    await expect(sendAdvanceReminders("2026-12-01")).rejects.toThrow("down");
    expect(told).toEqual([]);
  });
});
