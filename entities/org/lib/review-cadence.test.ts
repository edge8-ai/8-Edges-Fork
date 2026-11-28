import { describe, expect, it } from "vitest";
import { weeklyReminderDue } from "./review-cadence";

// Z.20: the review scheduler runs on weekdays only, so a weekly reminder that
// falls on a weekend goes on the Monday after it, once.

describe("weeklyReminderDue", () => {
  it("reminds on each seventh day of a part opened on a weekday", () => {
    // Opened Wednesday 2026-11-04.
    expect(weeklyReminderDue("2026-11-04", "2026-11-11")).toBe(true);
    expect(weeklyReminderDue("2026-11-04", "2026-11-18")).toBe(true);
    expect(weeklyReminderDue("2026-11-04", "2026-11-12")).toBe(false);
    expect(weeklyReminderDue("2026-11-04", "2026-11-04")).toBe(false);
  });

  it("moves a reminder that lands on a Saturday or a Sunday to the Monday after it", () => {
    // Opened Saturday 2026-11-07 and Sunday 2026-11-08: day seven is a weekend day.
    expect(weeklyReminderDue("2026-11-07", "2026-11-16")).toBe(true);
    expect(weeklyReminderDue("2026-11-08", "2026-11-16")).toBe(true);
    // Not again on the Tuesday, and on the next Monday for the second week.
    expect(weeklyReminderDue("2026-11-07", "2026-11-17")).toBe(false);
    expect(weeklyReminderDue("2026-11-07", "2026-11-23")).toBe(true);
  });

  it("stops after day forty-two", () => {
    expect(weeklyReminderDue("2026-11-04", "2026-12-16")).toBe(true);
    expect(weeklyReminderDue("2026-11-04", "2026-12-23")).toBe(false);
  });
});
