import { describe, expect, it } from "vitest";
import {
  computeLeaveBalance,
  usageHours,
  type UsageRow,
  serviceYearOn,
  tierFor,
  type AccrualPolicy,
  type BalanceInput,
} from "./balance";

// Two reference policies (plan: private-docs/workflows/private/e8/pto-policies-plan.html).
// The client policy accrues twice a month on an anniversary year with a
// 120-hour cap; the company policy accrues monthly on the calendar year and
// carries nothing over. Names here are placeholders, never real clients.

const clientPolicy: AccrualPolicy = {
  yearBasis: "anniversary",
  cadence: "semi_monthly",
  tiers: [
    { fromYear: 1, hoursPerYear: 80 },
    { fromYear: 3, hoursPerYear: 120 },
    { fromYear: 4, hoursPerYear: 160 },
  ],
  hoursPerDay: 8,
  carryCapHours: 120,
  minIncrementHours: 1,
  bankLeaveTypes: ["vacation", "sick", "personal"],
};

const companyPolicy: AccrualPolicy = {
  yearBasis: "calendar",
  cadence: "monthly",
  tiers: [
    { fromYear: 1, hoursPerYear: 96 },
    { fromYear: 6, hoursPerYear: 104 },
    { fromYear: 11, hoursPerYear: 112 },
  ],
  hoursPerDay: 8,
  carryCapHours: 0,
  minIncrementHours: 4,
  bankLeaveTypes: ["vacation"],
};

const base = (over: Partial<BalanceInput>): BalanceInput => ({
  policy: clientPolicy,
  anniversaryDate: "2024-09-30",
  asOf: "2026-09-12",
  usage: [],
  adjustments: [],
  ...over,
});

const day = (startDate: string, endDate = startDate, leaveType = "vacation", status = "approved") => ({
  startDate,
  endDate,
  isHalfDay: false,
  status,
  leaveType,
  hours: null,
});

describe("serviceYearOn", () => {
  it("counts year 1 from the anniversary date up to the day before the first anniversary", () => {
    expect(serviceYearOn("2024-09-30", "2024-09-29")).toBe(0);
    expect(serviceYearOn("2024-09-30", "2024-09-30")).toBe(1);
    expect(serviceYearOn("2024-09-30", "2025-09-29")).toBe(1);
    expect(serviceYearOn("2024-09-30", "2025-09-30")).toBe(2);
    expect(serviceYearOn("2024-09-30", "2026-09-30")).toBe(3);
  });

  it("picks the highest tier at or below the service year", () => {
    expect(tierFor(clientPolicy, 1)?.hoursPerYear).toBe(80);
    expect(tierFor(clientPolicy, 2)?.hoursPerYear).toBe(80);
    expect(tierFor(clientPolicy, 3)?.hoursPerYear).toBe(120);
    expect(tierFor(clientPolicy, 9)?.hoursPerYear).toBe(160);
  });
});

describe("computeLeaveBalance, anniversary policy", () => {
  it("posts 3.34 hours twice a month in year 1 and nothing before the anniversary", () => {
    // Probation ended 30 Sep 2024; by 31 Oct 2024 two postings have landed
    // (15 Oct and 31 Oct). The 30 Sep posting itself is excluded because
    // accrual starts strictly after the anniversary date.
    const b = computeLeaveBalance(base({ asOf: "2024-10-31" }));
    expect(b.hasRules).toBe(true);
    expect(b.serviceYear).toBe(1);
    expect(b.accruedHours).toBeCloseTo(80 / 24 * 2, 2);
    expect(b.remainingHours).toBe(b.accruedHours);
    expect(b.tier?.hoursPerPeriod).toBe(3.33);
  });

  it("reproduces the worked example: steps up to 5 hours a period on the second anniversary", () => {
    // 30 Sep 2026 is the second anniversary, so service year 3 begins and the
    // 15 Oct posting is the first at the year-3 rate.
    const before = computeLeaveBalance(base({ asOf: "2026-09-29" }));
    expect(before.serviceYear).toBe(2);
    expect(before.nextStepUp).toEqual({ date: "2026-09-30", hoursPerYear: 120 });

    const after = computeLeaveBalance(base({ asOf: "2026-10-15" }));
    expect(after.serviceYear).toBe(3);
    expect(after.tier?.hoursPerYear).toBe(120);
    expect(after.nextAccrual).toEqual({ date: "2026-10-31", hours: 5 });
    // 47 postings at 80/24 up to 15 Sep 2026, then the 30 Sep posting lands on
    // the anniversary itself and already belongs to year 3, as does 15 Oct.
    expect(after.accruedHours).toBeCloseTo(47 * (80 / 24) + 10, 2);
    expect(after.nextStepUp).toEqual({ date: "2027-09-30", hoursPerYear: 160 });
  });

  it("forfeits hours above the cap at the anniversary and reports the hours at risk before it", () => {
    // Nothing taken for two years: 160 hours accrued by 30 Sep 2026, capped
    // to 120 that day. The 15 Sep 2026 read shows the risk.
    const atRisk = computeLeaveBalance(base({ asOf: "2026-09-15" }));
    expect(atRisk.nextCapCheck?.date).toBe("2026-09-30");
    // 24 postings in year 1 capped to 80 on 30 Sep 2025 (nothing lost), then
    // 23 more by 15 Sep 2026: 80 + 23 * 3.333 = 156.67, so 36.67 at risk.
    expect(atRisk.nextCapCheck?.atRiskHours).toBeCloseTo(36.67, 1);

    // On the day: the cap closes year 2 at 120 (36.67 lost), then the 5-hour
    // year-3 posting lands on top, so the new year opens at 125.
    const capped = computeLeaveBalance(base({ asOf: "2026-09-30" }));
    expect(capped.forfeitedHours).toBeCloseTo(36.67, 1);
    expect(capped.remainingHours).toBeCloseTo(125, 1);
    expect(capped.openingHours).toBe(120);
  });

  it("deducts approved and taken leave in bank types, ignores rejected and out-of-bank types, and holds pending apart", () => {
    const b = computeLeaveBalance(
      base({
        asOf: "2025-03-31",
        usage: [
          day("2025-01-06", "2025-01-07"), // 2 days approved vacation, 16 h
          day("2025-02-03", "2025-02-03", "sick", "taken"), // 8 h, sick is in this bank
          day("2025-02-10", "2025-02-10", "vacation", "rejected"),
          day("2025-02-17", "2025-02-17", "public_holiday"), // not in the bank
          { ...day("2025-03-03"), isHalfDay: true }, // 4 h
          day("2025-04-14", "2025-04-15", "vacation", "requested"), // pending, 16 h
        ],
      }),
    );
    expect(b.usedHours).toBe(28);
    expect(b.pendingHours).toBe(16);
    // 12 postings from 15 Oct 2024 to 31 Mar 2025.
    expect(b.accruedHours).toBeCloseTo(40, 2);
    expect(b.remainingHours).toBeCloseTo(12, 2);
  });

  it("prefers a stored hours figure on a request over the working-day count", () => {
    const b = computeLeaveBalance(
      base({ asOf: "2025-01-31", usage: [{ ...day("2025-01-06"), hours: 2 }] }),
    );
    expect(b.usedHours).toBe(2);
  });

  it("applies manual adjustments in days on their effective date", () => {
    const b = computeLeaveBalance(
      base({ asOf: "2024-12-31", adjustments: [{ effectiveDate: "2024-11-01", deltaDays: 1.5 }] }),
    );
    expect(b.adjustedHours).toBe(12);
    expect(b.remainingHours).toBeCloseTo(80 / 24 * 6 + 12, 2);
  });
});

describe("computeLeaveBalance, calendar policy", () => {
  it("accrues one day a month from the day probation ended and carries nothing into the new year", () => {
    // Probation ended 10 Jul 2026; postings on 31 Jul .. 31 Dec are six days.
    const dec = computeLeaveBalance(
      base({ policy: companyPolicy, anniversaryDate: "2026-07-10", asOf: "2026-12-31", usage: [day("2026-11-02")] }),
    );
    expect(dec.accruedHours).toBe(48);
    expect(dec.usedHours).toBe(8);
    expect(dec.remainingHours).toBe(40);
    expect(dec.nextCapCheck).toEqual({ date: "2027-01-01", atRiskHours: 40 });

    const jan = computeLeaveBalance(
      base({ policy: companyPolicy, anniversaryDate: "2026-07-10", asOf: "2027-01-01", usage: [day("2026-11-02")] }),
    );
    expect(jan.forfeitedHours).toBe(40);
    expect(jan.remainingHours).toBe(0);
  });

  it("steps up to the seniority tier in service year 6", () => {
    const b = computeLeaveBalance(
      base({ policy: companyPolicy, anniversaryDate: "2023-08-19", asOf: "2028-08-31" }),
    );
    expect(b.serviceYear).toBe(6);
    expect(b.tier?.hoursPerYear).toBe(104);
    expect(b.nextAccrual).toEqual({ date: "2028-09-30", hours: 8.67 });
    expect(b.nextStepUp).toEqual({ date: "2033-08-19", hoursPerYear: 112 });
  });
});

describe("computeLeaveBalance, anchored", () => {
  it("starts from the anchor and ignores everything dated on or before it", () => {
    const b = computeLeaveBalance(
      base({
        asOf: "2026-08-31",
        anchor: { date: "2026-07-06", hours: 54.56 },
        usage: [day("2026-06-01"), day("2026-07-06"), day("2026-08-03")],
        adjustments: [{ effectiveDate: "2026-07-06", deltaDays: 99 }],
      }),
    );
    expect(b.anchorHours).toBe(54.56);
    // Four postings: 15 Jul, 31 Jul, 15 Aug, 31 Aug.
    expect(b.accruedHours).toBeCloseTo(13.33, 2);
    expect(b.usedHours).toBe(8);
    expect(b.adjustedHours).toBe(0);
    expect(b.remainingHours).toBeCloseTo(54.56 + 13.33 - 8, 1);
  });
});

describe("computeLeaveBalance, used all time and this policy year", () => {
  it("counts every banked day ever taken, and the ones since the last anniversary, even when an anchor absorbed them", () => {
    const b = computeLeaveBalance(
      base({
        asOf: "2026-09-12",
        anchor: { date: "2026-07-06", hours: 40 },
        usage: [
          day("2025-03-03"),
          day("2025-10-01"),
          day("2026-08-03"),
          day("2026-08-04", "2026-08-04", "parental"),
          day("2026-08-05", "2026-08-05", "vacation", "rejected"),
        ],
      }),
    );
    // Anniversary 30 Sep 2024: service year 2 runs from 30 Sep 2025.
    expect(b.policyYearStart).toBe("2025-09-30");
    expect(b.usedAllTimeHours).toBe(24);
    expect(b.usedPolicyYearHours).toBe(16);
    // The balance itself still only deducts what falls after the anchor.
    expect(b.usedHours).toBe(8);
  });

  it("uses 1 January as the policy year start on a calendar policy", () => {
    const b = computeLeaveBalance(
      base({ policy: companyPolicy, asOf: "2026-09-12", usage: [day("2025-12-15"), day("2026-02-02")] }),
    );
    expect(b.policyYearStart).toBe("2026-01-01");
    expect(b.usedAllTimeHours).toBe(16);
    expect(b.usedPolicyYearHours).toBe(8);
  });
});

describe("computeLeaveBalance, the yearly view", () => {
  it("reports what was carried into the current policy year after the cap, and what accrued since", () => {
    // Anniversary 30 Sep 2024, as of 12 Sep 2026: service year 2 runs 30 Sep
    // 2025 to 29 Sep 2026. Year 1 posts 3.33 h on the 23 dates from 15 Oct
    // 2024 to 15 Sep 2025 and takes nothing, so 76.67 h carries into year 2
    // (under the 120 h cap); year 2 has posted on 23 dates, 30 Sep 2025 (its
    // first day is a posting day) to 31 Aug 2026.
    const b = computeLeaveBalance(base({ usage: [day("2025-11-03")] }));
    expect(b.policyYearStart).toBe("2025-09-30");
    expect(b.openingHours).toBeCloseTo(23 * (80 / 24), 1);
    expect(b.accruedPolicyYearHours).toBeCloseTo(23 * (80 / 24), 1);
    expect(b.usedPolicyYearHours).toBe(8);
    expect(b.remainingHours).toBeCloseTo(b.openingHours + b.accruedPolicyYearHours - b.usedPolicyYearHours, 1);
  });

  it("carries in the capped figure when the cap forfeited hours at the anniversary", () => {
    // 20 days a year from year 4 would run past the cap; check a member deep in
    // service whose bank had grown to 150 h by the anniversary.
    const b = computeLeaveBalance(
      base({ anniversaryDate: "2021-09-30", asOf: "2026-10-01", usage: [] }),
    );
    expect(b.openingHours).toBe(120);
    expect(b.forfeitedHours).toBeGreaterThan(0);
  });

  it("carries nothing into a calendar year on a policy with a zero cap", () => {
    const b = computeLeaveBalance(
      base({ policy: companyPolicy, anniversaryDate: "2024-10-13", asOf: "2026-03-15", usage: [] }),
    );
    expect(b.policyYearStart).toBe("2026-01-01");
    expect(b.openingHours).toBe(0);
    expect(b.accruedPolicyYearHours).toBe(2 * 8);
    expect(b.remainingHours).toBe(16);
  });
});

describe("computeLeaveBalance, ledger", () => {
  it("lists the opening balance and every event with a running balance that ends at the remaining figure", () => {
    const b = computeLeaveBalance(
      base({
        asOf: "2026-08-31",
        anchor: { date: "2026-07-06", hours: 54.56 },
        usage: [day("2026-06-01"), day("2026-08-03")],
      }),
    );
    expect(b.ledger.map((l) => l.kind)).toEqual(["opening", "accrual", "accrual", "usage", "accrual", "accrual"]);
    expect(b.ledger[0]).toMatchObject({ date: "2026-07-06", hours: 54.56, balanceHours: 54.56 });
    expect(b.ledger[1]).toMatchObject({ date: "2026-07-15", serviceYear: 2 });
    expect(b.ledger[3]).toMatchObject({ kind: "usage", date: "2026-08-03", hours: -8, leaveType: "vacation" });
    expect(b.ledger.at(-1)!.balanceHours).toBe(b.remainingHours);
    expect(b.policyYearStart).toBe("2025-09-30");
    expect(b.policyYearEnd).toBe("2026-09-29");
  });

  it("records hours lost at the carry-over cap as their own line", () => {
    const b = computeLeaveBalance(base({ asOf: "2026-10-05", anchor: { date: "2026-09-01", hours: 150 } }));
    const lost = b.ledger.find((l) => l.kind === "forfeit")!;
    expect(lost.date).toBe("2026-09-30");
    expect(lost.balanceHours).toBe(120);
    expect(-lost.hours).toBeCloseTo(b.forfeitedHours, 2);
    expect(b.policyYearStart).toBe("2026-09-30");
    expect(b.policyYearEnd).toBe("2027-09-29");
  });
});

describe("computeLeaveBalance, no rules", () => {
  it("reports hasRules false for a policy with no accrual and for a member with no anniversary", () => {
    const none: AccrualPolicy = { ...companyPolicy, cadence: "none", tiers: [] };
    expect(computeLeaveBalance(base({ policy: none })).hasRules).toBe(false);
    expect(computeLeaveBalance(base({ anniversaryDate: null })).hasRules).toBe(false);
  });
});

// T.1: how many hours a leave row deducts. The precedence matters as much as
// the holiday subtraction — before T.1 every row fell through to a
// weekends-only count, because `hours` is null on every row in the database and
// the stored `days` was not consulted at all, so the balance walk silently
// restated leave that had already been agreed.
describe("usageHours", () => {
  const row = (over: Partial<UsageRow> = {}): UsageRow => ({
    startDate: "2026-04-27",
    endDate: "2026-05-01",
    isHalfDay: false,
    status: "approved",
    leaveType: "vacation",
    hours: null,
    days: null,
    ...over,
  });

  it("uses recorded hours above everything else", () => {
    expect(usageHours(row({ hours: 12, days: 5 }), 8, [])).toBe(12);
  });

  it("uses the stored day count before recomputing from the dates", () => {
    // Three days at 8h, even though the dates span five weekdays: the row was
    // agreed at three and must not be restated.
    expect(usageHours(row({ days: 3 }), 8)).toBe(24);
  });

  it("subtracts office closures when it has to count from the dates", () => {
    // Mon 27 Apr – Fri 1 May: five weekdays, two of them public holidays.
    expect(usageHours(row(), 8, ["2026-04-30", "2026-05-01"])).toBe(24);
  });

  it("counts weekdays only when given no calendar, as it always did", () => {
    expect(usageHours(row(), 8)).toBe(40);
  });
});

describe("computeLeaveBalance with a holiday calendar", () => {
  it("deducts less for leave spanning a closure than for the same span without one", () => {
    const usage: UsageRow[] = [
      {
        startDate: "2026-04-27",
        endDate: "2026-05-01",
        isHalfDay: false,
        status: "approved",
        leaveType: "vacation",
        hours: null,
        days: null,
      },
    ];
    const withoutCalendar = computeLeaveBalance(base({ asOf: "2026-05-30", usage }));
    const withCalendar = computeLeaveBalance(
      base({ asOf: "2026-05-30", usage, holidays: ["2026-04-30", "2026-05-01"] }),
    );
    // Two closure days at the policy's day length come back to the employee.
    expect(withoutCalendar.usedAllTimeHours - withCalendar.usedAllTimeHours).toBe(16);
    expect(withCalendar.remainingHours).toBeGreaterThan(withoutCalendar.remainingHours);
  });

  it("leaves a row with a stored day count untouched by the calendar", () => {
    const usage: UsageRow[] = [
      {
        startDate: "2026-04-27",
        endDate: "2026-05-01",
        isHalfDay: false,
        status: "approved",
        leaveType: "vacation",
        hours: null,
        days: 3,
      },
    ];
    const a = computeLeaveBalance(base({ asOf: "2026-05-30", usage }));
    const b = computeLeaveBalance(
      base({ asOf: "2026-05-30", usage, holidays: ["2026-04-30", "2026-05-01"] }),
    );
    expect(a.usedAllTimeHours).toBe(24);
    expect(b.usedAllTimeHours).toBe(24);
  });
});
