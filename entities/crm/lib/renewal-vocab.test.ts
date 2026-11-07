import { describe, expect, it } from "vitest";
import { renewalDistance, renewalDueSoon } from "./renewal-vocab";

describe("renewalDueSoon", () => {
  const today = "2026-09-25";
  it("flags an upcoming renewal within 60 days, and not one further out", () => {
    expect(renewalDueSoon({ renews_on: "2026-11-24", status: "upcoming" }, today)).toBe(true);
    expect(renewalDueSoon({ renews_on: "2026-11-25", status: "upcoming" }, today)).toBe(false);
  });

  it("keeps flagging an upcoming renewal whose date has passed with nothing recorded", () => {
    expect(renewalDueSoon({ renews_on: "2026-09-01", status: "upcoming" }, today)).toBe(true);
  });

  it("does not flag a renewal that has an outcome, or no renewal at all", () => {
    expect(renewalDueSoon({ renews_on: "2026-10-01", status: "renewed" }, today)).toBe(false);
    expect(renewalDueSoon({ renews_on: "2026-10-01", status: "churned" }, today)).toBe(false);
    expect(renewalDueSoon(null, today)).toBe(false);
  });
});

describe("renewalDistance", () => {
  it("says the date relative to today", () => {
    expect(renewalDistance("2026-09-25", "2026-09-25")).toBe("today");
    expect(renewalDistance("2026-09-26", "2026-09-25")).toBe("in 1 day");
    expect(renewalDistance("2026-10-07", "2026-09-25")).toBe("in 12 days");
    expect(renewalDistance("2026-09-22", "2026-09-25")).toBe("3 days ago");
  });
});
