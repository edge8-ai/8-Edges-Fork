import { describe, expect, it } from "vitest";
import { rosterSection } from "./roster-sections";

const TODAY = "2026-10-06";

describe("rosterSection", () => {
  it("puts anything waiting on the coach under Needs you", () => {
    expect(rosterSection({ kind: "member-proposed", on: "2026-10-09" }, TODAY)).toBe("needs");
    expect(rosterSection({ kind: "missed", on: "2026-10-01", meetingId: "m", worthPrompting: true }, TODAY)).toBe("needs");
    expect(rosterSection({ kind: "none", everMet: false, suggestedOn: null }, TODAY)).toBe("needs");
  });

  it("asks for a booking when the rhythm's next day is close and nothing is booked", () => {
    expect(rosterSection({ kind: "none", everMet: true, suggestedOn: "2026-10-08" }, TODAY)).toBe("needs");
    expect(rosterSection({ kind: "none", everMet: true, suggestedOn: "2026-10-20" }, TODAY)).toBe("later");
  });

  it("splits bookings at a week", () => {
    expect(rosterSection({ kind: "booked", on: "2026-10-13", agendaWritten: false, everMet: true }, TODAY)).toBe("week");
    expect(rosterSection({ kind: "booked", on: "2026-10-14", agendaWritten: false, everMet: true }, TODAY)).toBe("later");
  });

  it("leaves a paused rhythm alone", () => {
    expect(rosterSection({ kind: "none", everMet: true, suggestedOn: null }, TODAY)).toBe("later");
  });
});
