import { describe, expect, it } from "vitest";
import { openCommitmentsNote, profileIsBare, type ProfileFacts } from "./profile-bare";

const NOTHING: ProfileFacts = {
  hasNextMeeting: false,
  hasHeldMeeting: false,
  openCommitments: 0,
  goals: 0,
};

describe("profileIsBare", () => {
  it("is bare when the relationship has no meeting, no promise and no goal", () => {
    expect(profileIsBare(NOTHING)).toBe(true);
  });

  // Any ONE real fact is enough: the tiles earn the screen when they have
  // something to report, and a single booked date is something to report.
  it.each([
    ["a date on the calendar", { hasNextMeeting: true }],
    ["a 1-1 already held", { hasHeldMeeting: true }],
    ["something promised", { openCommitments: 1 }],
    ["a goal, even a draft", { goals: 1 }],
  ])("is not bare with %s", (_label, patch) => {
    expect(profileIsBare({ ...NOTHING, ...patch })).toBe(false);
  });
});

describe("openCommitmentsNote", () => {
  it("splits the count by side when something is open", () => {
    expect(openCommitmentsNote({ open: 3, them: 2, me: 1, everMade: true })).toBe("them 2 · me 1");
  });

  // The defect this replaces. "All clear" reads as a positive report on a
  // relationship where nothing was ever promised.
  it("does not claim all clear when nothing was ever promised", () => {
    expect(openCommitmentsNote({ open: 0, them: 0, me: 0, everMade: false })).toBe("none promised yet");
  });

  it("does say all kept when there was something to keep", () => {
    expect(openCommitmentsNote({ open: 0, them: 0, me: 0, everMade: true })).toBe("all kept");
  });
});
