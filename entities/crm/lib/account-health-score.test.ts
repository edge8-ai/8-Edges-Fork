import { describe, expect, it } from "vitest";
import { describeSignals, scoreHealth, type HealthSignals } from "./account-health-score";

// A healthy account: met last week, nothing overdue, the roadmap moving, the
// client signing in to the portal. Each case below changes one thing.
const healthy: HealthSignals = {
  daysSinceMeeting: 7,
  neverMet: false,
  overdueInvoices: 0,
  roadmapMoves30d: 4,
  portalSignInDays: 2,
  portalNeverSignedIn: false,
};

const with_ = (patch: Partial<HealthSignals>): HealthSignals => ({ ...healthy, ...patch });

describe("scoreHealth", () => {
  it("starts at 100 for an account with nothing wrong", () => {
    expect(scoreHealth(healthy)).toBe(100);
  });

  it("takes 20 for a last meeting over 30 days ago, and nothing at exactly 30", () => {
    expect(scoreHealth(with_({ daysSinceMeeting: 30 }))).toBe(100);
    expect(scoreHealth(with_({ daysSinceMeeting: 31 }))).toBe(80);
    expect(scoreHealth(with_({ daysSinceMeeting: 60 }))).toBe(80);
  });

  it("takes 35 for a last meeting over 60 days ago", () => {
    expect(scoreHealth(with_({ daysSinceMeeting: 61 }))).toBe(65);
  });

  it("scores an account nobody has ever met as the worst meeting case", () => {
    expect(scoreHealth(with_({ daysSinceMeeting: null, neverMet: true }))).toBe(65);
  });

  it("costs nothing when the meeting signal could not be computed", () => {
    expect(scoreHealth(with_({ daysSinceMeeting: null, neverMet: false }))).toBe(100);
  });

  it("takes 15 per overdue invoice, capped at 45", () => {
    expect(scoreHealth(with_({ overdueInvoices: 1 }))).toBe(85);
    expect(scoreHealth(with_({ overdueInvoices: 2 }))).toBe(70);
    expect(scoreHealth(with_({ overdueInvoices: 3 }))).toBe(55);
    expect(scoreHealth(with_({ overdueInvoices: 7 }))).toBe(55);
  });

  it("costs nothing when the invoice signal could not be computed", () => {
    expect(scoreHealth(with_({ overdueInvoices: null }))).toBe(100);
  });

  it("takes 15 when the roadmap has not moved in 30 days, and nothing when there is no roadmap", () => {
    expect(scoreHealth(with_({ roadmapMoves30d: 0 }))).toBe(85);
    expect(scoreHealth(with_({ roadmapMoves30d: null }))).toBe(100);
  });

  it("takes 15 when the last portal sign-in is over 30 days old", () => {
    expect(scoreHealth(with_({ portalSignInDays: 30 }))).toBe(100);
    expect(scoreHealth(with_({ portalSignInDays: 31 }))).toBe(85);
  });

  it("skips the portal when the company has no portal members", () => {
    expect(scoreHealth(with_({ portalSignInDays: null, portalNeverSignedIn: false }))).toBe(100);
  });

  it("counts portal members who have never signed in as over 30 days", () => {
    expect(scoreHealth(with_({ portalSignInDays: null, portalNeverSignedIn: true }))).toBe(85);
  });

  it("clamps at 0 when every signal is at its worst", () => {
    // 35 + 45 + 15 + 15 = 110 off 100.
    const worst = { daysSinceMeeting: null, neverMet: true, overdueInvoices: 5, roadmapMoves30d: 0, portalSignInDays: 90, portalNeverSignedIn: false };
    expect(scoreHealth(worst)).toBe(0);
  });
});

describe("describeSignals", () => {
  it("says each signal in words", () => {
    expect(describeSignals(healthy)).toEqual({
      meeting: "Last met 7 days ago",
      invoices: "No overdue invoices",
      roadmap: "4 roadmap moves in 30 days",
      portal: "Portal sign-in 2 days ago",
    });
  });

  it("names the never and none cases rather than printing a blank", () => {
    expect(
      describeSignals({ daysSinceMeeting: null, neverMet: true, overdueInvoices: 1, roadmapMoves30d: 0, portalSignInDays: null, portalNeverSignedIn: true }),
    ).toEqual({
      meeting: "Never met",
      invoices: "1 overdue invoice",
      roadmap: "No roadmap moves in 30 days",
      portal: "Portal never signed in",
    });
    expect(
      describeSignals({ daysSinceMeeting: 0, neverMet: false, overdueInvoices: null, roadmapMoves30d: null, portalSignInDays: null, portalNeverSignedIn: false }),
    ).toEqual({
      meeting: "Met today",
      invoices: "Invoices unknown",
      roadmap: "No roadmap",
      portal: "No portal members",
    });
  });
});
