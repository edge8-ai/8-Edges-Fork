import { describe, expect, it } from "vitest";
import type { LeaveBalance } from "./balance";
import { toPolicySummary, type PolicyDbRow } from "./policy";
import { balanceFacts, dayBefore, daysByType, outByDay, ownByDay, splitRequests, tracksLeaveByType, type OwnLeaveRow } from "./time-off-view";

const balance = (over: Partial<LeaveBalance>): LeaveBalance =>
  ({
    remainingHours: 16,
    openingHours: 0,
    accruedPolicyYearHours: 16,
    usedPolicyYearHours: 0,
    pendingHours: 0,
    bookedHours: 0,
    nextAccrual: { date: "2026-10-31", hours: 8 },
    nextCapCheck: { date: "2027-01-01", atRiskHours: 16 },
    tier: { hoursPerYear: 96, hoursPerPeriod: 8 },
    ...over,
  }) as LeaveBalance;

describe("balanceFacts", () => {
  it("reads days from hours and names the last day before the year-end check", () => {
    const f = balanceFacts(balance({}), 8, 0);
    expect(f).toMatchObject({ available: 2, earned: 2, accrued: 2, taken: 0, ratePerYear: 12, carriesOver: false });
    expect(f.next).toEqual({ days: 1, date: "2026-10-31" });
    expect(f.useBy).toEqual({ date: "2026-12-31", atRiskDays: 2 });
  });

  it("takes booked days out of what is free to book, and out of what the year-end would forfeit", () => {
    const f = balanceFacts(balance({ bookedHours: 8 }), 8, 0);
    expect(f).toMatchObject({ available: 1, hoursAvailable: 8, booked: 1 });
    expect(f.useBy).toEqual({ date: "2026-12-31", atRiskDays: 1 });
  });

  it("has no use-by date once every day at risk is booked", () => {
    expect(balanceFacts(balance({ bookedHours: 16 }), 8, 0)).toMatchObject({ available: 0, useBy: null });
  });

  it("goes negative when more is booked than has accrued", () => {
    expect(balanceFacts(balance({ bookedHours: 24 }), 8, 0).available).toBe(-1);
  });

  it("has no use-by date when nothing is at risk", () => {
    expect(balanceFacts(balance({ nextCapCheck: { date: "2027-01-01", atRiskHours: 0 } }), 8, null).useBy).toBeNull();
  });
});

describe("dayBefore", () => {
  it("crosses a year boundary as a calendar date", () => {
    expect(dayBefore("2027-01-01")).toBe("2026-12-31");
  });
});

describe("outByDay", () => {
  const spans = [
    { personId: "p1", name: "Teammate One", start: "2026-10-09", end: "2026-10-12" },
    { personId: "me", name: "The Viewer", start: "2026-10-09", end: "2026-10-09" },
    { personId: "p2", name: "Teammate Two", start: "2026-11-23", end: "2026-11-25" },
  ];

  it("lists teammates on working days only, never the viewer", () => {
    const map = outByDay(spans, "2026-10-01", "2026-10-31", new Set(), "me");
    expect(map["2026-10-09"]).toEqual(["Teammate One"]);
    expect(map["2026-10-10"]).toBeUndefined();
    expect(map["2026-10-12"]).toEqual(["Teammate One"]);
  });

  it("skips a closed holiday and clips to the window", () => {
    const map = outByDay(spans, "2026-11-01", "2026-11-24", new Set(["2026-11-24"]), "me");
    expect(map["2026-11-23"]).toEqual(["Teammate Two"]);
    expect(map["2026-11-24"]).toBeUndefined();
    expect(map["2026-11-25"]).toBeUndefined();
  });
});

const row = (over: Partial<OwnLeaveRow>): OwnLeaveRow => ({
  id: "r", leaveType: "vacation", status: "approved", startDate: "2026-10-19", endDate: "2026-10-20", isHalfDay: false, reason: null, days: null, ...over,
});

describe("ownByDay", () => {
  it("draws live leave by type and leaves cancelled leave off", () => {
    const map = ownByDay([row({}), row({ id: "c", status: "cancelled", startDate: "2026-10-21", endDate: "2026-10-21" }), row({ id: "w", status: "requested", leaveType: "sick", startDate: "2026-10-22", endDate: "2026-10-22" })], new Set());
    expect(map["2026-10-19"]).toEqual({ type: "vacation", pending: false });
    expect(map["2026-10-21"]).toBeUndefined();
    expect(map["2026-10-22"]).toEqual({ type: "sick", pending: true });
  });
});

describe("daysByType", () => {
  it("counts approved and taken days since the policy year began", () => {
    const totals = daysByType([row({}), row({ id: "old", endDate: "2025-12-31", startDate: "2025-12-30" }), row({ id: "s", leaveType: "sick", days: 0.5 })], "2026-01-01", []);
    expect(totals).toEqual({ vacation: 2, sick: 0.5 });
  });
});

describe("splitRequests", () => {
  it("puts waiting requests apart from decided ones", () => {
    const { pending, history } = splitRequests([{ status: "requested" }, { status: "approved" }, { status: "cancelled" }]);
    expect(pending).toHaveLength(1);
    expect(history).toHaveLength(2);
  });
});

describe("tracksLeaveByType", () => {
  // The three shapes production holds: a one-type bank that accrues, a pooled
  // PTO bank, and a policy that accrues nothing.
  const policy = (over: Partial<PolicyDbRow>) =>
    toPolicySummary({
      id: "p", name: "A policy", auto_approve: false, policy_text: null, year_basis: "calendar",
      accrual_cadence: "monthly", tiers: [{ fromYear: 1, hoursPerYear: 96 }], hours_per_day: 8,
      min_increment_hours: 4, carry_cap_hours: null, bank_leave_types: ["vacation"],
      honour_imported_balance: false, counts_from: "probation_end", ...over,
    });

  it("is true for a bank of one type that accrues, where every other type is counted on its own", () => {
    expect(tracksLeaveByType(policy({}))).toBe(true);
  });

  it("is false for a pooled PTO bank, where the types share one balance", () => {
    expect(tracksLeaveByType(policy({ accrual_cadence: "semi_monthly", bank_leave_types: ["vacation", "sick", "personal"] }))).toBe(false);
  });

  it("is false for a policy that accrues nothing, and with no policy at all", () => {
    expect(tracksLeaveByType(policy({ accrual_cadence: "none", tiers: [] }))).toBe(false);
    expect(tracksLeaveByType(null)).toBe(false);
  });
});
