import { describe, expect, it, vi } from "vitest";

// review.ts imports the data client for its reads and writes; the pure
// functions under test never touch it.
vi.mock("@/kernel/data/supabase", () => ({ companyOs: {} }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn() }));

import { computeLeaveBalance, type AccrualPolicy } from "./balance";
import type { MemberLeave } from "./balances";
import { balanceFingerprint, leaveWarnings } from "./review";

const accrual: AccrualPolicy = {
  yearBasis: "anniversary",
  cadence: "semi_monthly",
  tiers: [{ fromYear: 1, hoursPerYear: 80 }],
  hoursPerDay: 8,
  carryCapHours: 120,
  minIncrementHours: 1,
  bankLeaveTypes: ["vacation"],
};

const day = (d: string) => ({ startDate: d, endDate: d, isHalfDay: false, status: "approved", leaveType: "vacation", hours: null });

function member(over: Partial<MemberLeave> & { usage?: ReturnType<typeof day>[]; anchorHours?: number }): MemberLeave {
  const anniversaryDate = over.anniversaryDate ?? "2025-09-30";
  const balance = computeLeaveBalance({
    policy: accrual,
    anniversaryDate,
    asOf: "2026-09-12",
    usage: over.usage ?? [],
    adjustments: [],
    anchor: over.anchorHours !== undefined ? { date: "2026-07-06", hours: over.anchorHours } : null,
  });
  return {
    teamMemberId: "m1",
    policy: {
      id: "p1",
      name: "Placeholder PTO",
      autoApprove: false,
      policyText: null,
      accrual,
      honourImportedBalance: over.anchorHours !== undefined,
      countsFrom: "probation_end",
    },
    anniversaryDate,
    startDate: "2025-08-01",
    probationRecorded: true,
    opening: over.anchorHours !== undefined ? { date: "2026-07-06", openingDays: 1, carryoverDays: 0 } : null,
    balance,
    ...over,
  };
}

describe("leaveWarnings", () => {
  it("flags leave over the yearly entitlement and a negative balance", () => {
    // All of October 2025: 23 working days against 10 a year.
    const usage = [{ ...day("2025-10-01"), endDate: "2025-10-31" }];
    const kinds = leaveWarnings(member({ usage }), null).map((w) => w.kind);
    expect(kinds).toContain("over_entitlement");
    expect(kinds).toContain("negative_balance");
  });

  it("flags a missing probation date and an unconfirmed opening balance until a current review exists", () => {
    const m = member({ probationRecorded: false, anchorHours: 16 });
    expect(leaveWarnings(m, null).map((w) => w.kind)).toEqual(["no_policy_start", "opening_unconfirmed"]);
    const reviewed = { reviewerLabel: "manager@example.com", reviewedAt: "2026-09-12T00:00:00Z", current: true };
    expect(leaveWarnings(m, reviewed).map((w) => w.kind)).toEqual(["no_policy_start"]);
  });

  it("raises nothing for a balance that is in order", () => {
    expect(leaveWarnings(member({ usage: [day("2026-08-03")] }), null)).toEqual([]);
  });
});

describe("balanceFingerprint", () => {
  it("stays the same across a routine accrual posting, so a confirmation does not expire twice a month", () => {
    const before = member({});
    const afterPosting: MemberLeave = {
      ...before,
      balance: computeLeaveBalance({
        policy: accrual,
        anniversaryDate: "2025-09-30",
        asOf: "2026-09-16",
        usage: [],
        adjustments: [],
        anchor: null,
      }),
    };
    expect(afterPosting.balance!.accruedHours).toBeGreaterThan(before.balance!.accruedHours);
    expect(balanceFingerprint(afterPosting)).toBe(balanceFingerprint(before));
  });

  it("changes when leave is taken, so an earlier confirmation goes stale", () => {
    const before = balanceFingerprint(member({}));
    const after = balanceFingerprint(member({ usage: [day("2026-08-03")] }));
    expect(before).not.toBeNull();
    expect(after).not.toBe(before);
  });
});
