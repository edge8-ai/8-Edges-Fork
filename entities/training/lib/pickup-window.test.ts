import { describe, expect, it } from "vitest";
import { dueForPickup, startedInWindow, titleMatches } from "./pickup-window";

const group = { startsAt: "2026-10-14T07:00:00Z", endsAt: "2026-10-14T08:15:00Z" };

describe("the pickup window", () => {
  it("matches a recording that started within fifteen minutes before the session up to its end, not the 1-1 later that day", () => {
    expect(startedInWindow(group, "2026-10-14T06:50:00Z")).toBe(true);
    expect(startedInWindow(group, "2026-10-14T07:03:00Z")).toBe(true);
    expect(startedInWindow(group, "2026-10-14T06:40:00Z")).toBe(false);
    expect(startedInWindow(group, "2026-10-14T09:00:00Z")).toBe(false);
  });

  it("matches the plan's Lark title inside the recording's title, diacritics and case folded", () => {
    expect(titleMatches("English Communication Practice", "English communication practice - 14 Oct")).toBe(true);
    expect(titleMatches("Đức 1-1", "Duc 1-1 English")).toBe(true);
    expect(titleMatches("English Communication Practice", "Weekly stand-up")).toBe(false);
  });

  it("looks for a session only thirty minutes after its end and within fourteen days", () => {
    expect(dueForPickup(group, new Date("2026-10-14T08:30:00Z"))).toBe(false);
    expect(dueForPickup(group, new Date("2026-10-14T08:45:00Z"))).toBe(true);
    expect(dueForPickup(group, new Date("2026-10-29T08:45:00Z"))).toBe(false);
  });
});
