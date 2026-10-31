import { describe, expect, it } from "vitest";
import {
  latestMeetingByCompany,
  overdueByCompany,
  portalAccountsByCompany,
  roadmapByCompany,
  signalsFor,
  type HealthFacts,
} from "./account-health-signals";

describe("latestMeetingByCompany", () => {
  it("keeps the latest start per company and skips rows without one", () => {
    const got = latestMeetingByCompany([
      { company_id: "a", started_at: "2026-09-01T03:00:00Z" },
      { company_id: "a", started_at: "2026-09-20T03:00:00Z" },
      { company_id: "b", started_at: null },
      { company_id: null, started_at: "2026-09-21T03:00:00Z" },
    ]);
    expect([...got]).toEqual([["a", "2026-09-20T03:00:00Z"]]);
  });
});

describe("overdueByCompany", () => {
  const today = "2026-09-25";
  it("counts invoices due before today that are still collectible", () => {
    const got = overdueByCompany(
      [
        { company_id: "a", status: "overdue", balance_cents: 5000, due_date: "2026-09-01" },
        { company_id: "a", status: "open", balance_cents: 100, due_date: "2026-09-24" },
        // Due today is not overdue yet.
        { company_id: "a", status: "open", balance_cents: 100, due_date: "2026-09-25" },
        // Voided: nobody owes it, whatever the balance says.
        { company_id: "a", status: "voided", balance_cents: 5000, due_date: "2026-08-01" },
        // Paid in full.
        { company_id: "a", status: "paid", balance_cents: 0, due_date: "2026-08-01" },
        // No due date cannot be late.
        { company_id: "b", status: "open", balance_cents: 100, due_date: null },
      ],
      today,
    );
    expect([...got]).toEqual([["a", 2]]);
  });
});

describe("roadmapByCompany", () => {
  it("counts moves in the window, archived ones included, and only live items make a roadmap", () => {
    const got = roadmapByCompany(
      [
        { company_id: "a", updated_at: "2026-09-20T00:00:00Z", archived_at: null },
        { company_id: "a", updated_at: "2026-07-01T00:00:00Z", archived_at: null },
        { company_id: "b", updated_at: "2026-09-10T00:00:00Z", archived_at: "2026-09-10T00:00:00Z" },
        { company_id: "c", updated_at: "2026-06-01T00:00:00Z", archived_at: null },
      ],
      "2026-08-26T00:00:00Z",
    );
    expect([...got.hasRoadmap].sort()).toEqual(["a", "c"]);
    expect(Object.fromEntries(got.moves)).toEqual({ a: 1, b: 1 });
  });
});

describe("portalAccountsByCompany", () => {
  it("groups auth accounts by company and skips members without one", () => {
    const got = portalAccountsByCompany([
      { company_id: "a", auth_user_id: "u1" },
      { company_id: "a", auth_user_id: "u2" },
      { company_id: "a", auth_user_id: null },
      { company_id: null, auth_user_id: "u3" },
    ]);
    expect(Object.fromEntries(got)).toEqual({ a: ["u1", "u2"] });
  });
});

describe("signalsFor", () => {
  const today = "2026-09-25";
  const facts: HealthFacts = {
    lastMeeting: new Map([["a", "2026-09-15T02:00:00Z"]]),
    overdue: new Map([["a", 2]]),
    roadmap: { hasRoadmap: new Set(["a", "b"]), moves: new Map([["a", 3]]) },
    portalAccounts: new Map([
      ["a", ["u1", "u2"]],
      ["b", ["u3"]],
    ]),
    lastSignIns: new Map<string, string | null>([
      ["u1", "2026-09-01T00:00:00Z"],
      ["u2", "2026-09-23T00:00:00Z"],
      ["u3", null],
    ]),
  };

  it("reads every signal for a company that has all four", () => {
    expect(signalsFor("a", facts, today)).toEqual({
      daysSinceMeeting: 10,
      neverMet: false,
      overdueInvoices: 2,
      roadmapMoves30d: 3,
      portalSignInDays: 2,
      portalNeverSignedIn: false,
    });
  });

  it("marks never met and never signed in, and a still roadmap as zero", () => {
    expect(signalsFor("b", facts, today)).toEqual({
      daysSinceMeeting: null,
      neverMet: true,
      overdueInvoices: 0,
      roadmapMoves30d: 0,
      portalSignInDays: null,
      portalNeverSignedIn: true,
    });
  });

  it("leaves the roadmap and portal null for a company that has neither", () => {
    const got = signalsFor("c", facts, today);
    expect(got.roadmapMoves30d).toBeNull();
    expect(got.portalSignInDays).toBeNull();
    expect(got.portalNeverSignedIn).toBe(false);
  });

  it("counts days on the Saigon calendar, not UTC", () => {
    // 18:00 UTC on the 24th is 01:00 on the 25th in Saigon: met today.
    const late = { ...facts, lastMeeting: new Map([["a", "2026-09-24T18:00:00Z"]]) };
    expect(signalsFor("a", late, today).daysSinceMeeting).toBe(0);
  });
});
