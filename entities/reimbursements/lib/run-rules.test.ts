import { describe, expect, it } from "vitest";
import { cutoffOf, isRunDay, latestRunDate, paymentsOf, runTotalsOf } from "./run-rules";

// The payment run's calendar and arithmetic (design §1.7), pure: what the
// cron, the "Build the run" action and the run page all ask.

describe("isRunDay", () => {
  it("is the 1st and the 15th, and nothing else", () => {
    expect(isRunDay("2026-10-01")).toBe(true);
    expect(isRunDay("2026-10-15")).toBe(true);
    expect(isRunDay("2026-10-14")).toBe(false);
    expect(isRunDay("2026-10-16")).toBe(false);
    expect(isRunDay("15 Oct")).toBe(false);
  });
});

describe("cutoffOf", () => {
  it("is 00:00 in Vietnam on the run date, as a UTC instant", () => {
    // Vietnam is UTC+7 with no daylight saving: midnight there is 17:00 UTC the day before.
    expect(cutoffOf("2026-10-15")).toBe("2026-10-14T17:00:00.000Z");
    expect(cutoffOf("2027-01-01")).toBe("2026-12-31T17:00:00.000Z");
  });
});

describe("latestRunDate", () => {
  it("is today on a run day, else the last 1st or 15th before it", () => {
    expect(latestRunDate("2026-10-15")).toBe("2026-10-15");
    expect(latestRunDate("2026-10-20")).toBe("2026-10-15");
    expect(latestRunDate("2026-10-14")).toBe("2026-10-01");
    expect(latestRunDate("2026-10-01")).toBe("2026-10-01");
  });
});

describe("paymentsOf", () => {
  it("groups a run's claims by person, summing the totals frozen at approval", () => {
    const groups = paymentsOf([
      { id: "c1", personId: "p1", approvedTotalVnd: 1_000_000 },
      { id: "c2", personId: "p2", approvedTotalVnd: 250_000 },
      { id: "c3", personId: "p1", approvedTotalVnd: 500_000 },
    ]);
    expect(groups).toEqual([
      { personId: "p1", claimIds: ["c1", "c3"], amountVnd: 1_500_000 },
      { personId: "p2", claimIds: ["c2"], amountVnd: 250_000 },
    ]);
  });
});

describe("runTotalsOf", () => {
  it("counts claims and people and totals what the run pays", () => {
    expect(
      runTotalsOf([
        { personId: "p1", approvedTotalVnd: 1_000_000 },
        { personId: "p2", approvedTotalVnd: 250_000 },
        { personId: "p1", approvedTotalVnd: 500_000 },
      ]),
    ).toEqual({ claims_count: 3, people_count: 2, total_vnd: 1_750_000 });
    expect(runTotalsOf([])).toEqual({ claims_count: 0, people_count: 0, total_vnd: 0 });
  });
});
