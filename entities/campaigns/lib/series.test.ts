import { describe, expect, it } from "vitest";
import { dueIssue } from "./series";

// Draft Monday 08:00 Perth, send Wednesday 08:00 Perth (UTC+8, no DST).
const perth = { timeZone: "Australia/Perth", draftWeekday: 1, draftHour: 8, sendWeekday: 3, sendHour: 8 };

describe("dueIssue", () => {
  it("is nothing before Monday 08:00 Perth", () => {
    // Sunday 2026-09-20 23:00 Perth = 15:00 UTC.
    expect(dueIssue(perth, new Date("2026-09-20T15:00:00Z"))).toBeNull();
  });

  it("opens Monday's issue for Wednesday 08:00 Perth", () => {
    // Monday 2026-09-21 09:00 Perth = 01:00 UTC.
    const due = dueIssue(perth, new Date("2026-09-21T01:00:00Z"));
    expect(due?.draftAt.toISOString()).toBe("2026-09-21T00:00:00.000Z");
    expect(due?.sendAt.toISOString()).toBe("2026-09-23T00:00:00.000Z");
  });

  it("still names the same issue on Tuesday, so the hourly cron can dedupe on it", () => {
    const due = dueIssue(perth, new Date("2026-09-22T10:00:00Z"));
    expect(due?.sendAt.toISOString()).toBe("2026-09-23T00:00:00.000Z");
  });

  it("skips the week once the send moment has passed", () => {
    expect(dueIssue(perth, new Date("2026-09-23T02:00:00Z"))).toBeNull();
  });
});
