import { describe, it, expect } from "vitest";
import {
  COACH_TAB_IDS,
  coachTabIsOffered,
  offeredCoachTabs,
  resolveCoachTab,
  type CoachTabFacts,
} from "./coach-tabs";

const nothing: CoachTabFacts = { meetings: 0, reviews: 0, trends: 0, checkins: 0 };

describe("offeredCoachTabs", () => {
  it("offers only the three writable tabs on a profile with nothing behind it", () => {
    expect(offeredCoachTabs(nothing)).toEqual(["next", "goals", "person"]);
  });

  it("offers every tab once each has something", () => {
    expect(offeredCoachTabs({ meetings: 1, reviews: 1, trends: 1, checkins: 1 })).toEqual([
      ...COACH_TAB_IDS,
    ]);
  });

  it("keeps the page's fixed order rather than the order things appeared", () => {
    const tabs = offeredCoachTabs({ meetings: 2, reviews: 1, trends: 0, checkins: 0 });
    expect(tabs).toEqual(["next", "log", "goals", "person", "performance"]);
  });

  it("opens the 1-1 log on the first meeting, scheduled or held", () => {
    expect(coachTabIsOffered("log", { ...nothing, meetings: 1 })).toBe(true);
  });

  it("earns Insights from a check-in alone, with no trend report yet", () => {
    expect(coachTabIsOffered("insights", { ...nothing, checkins: 1 })).toBe(true);
  });

  it("earns Insights from a trend report alone", () => {
    expect(coachTabIsOffered("insights", { ...nothing, trends: 1 })).toBe(true);
  });

  it("never hides a tab the coach can write into", () => {
    for (const id of ["next", "goals", "person"] as const) {
      expect(coachTabIsOffered(id, nothing)).toBe(true);
    }
  });
});

describe("resolveCoachTab", () => {
  it("defaults to Next 1-1 with no tab in the URL", () => {
    expect(resolveCoachTab(undefined, nothing)).toBe("next");
  });

  it("honours a deep link to an offered tab", () => {
    expect(resolveCoachTab("performance", { ...nothing, reviews: 2 })).toBe("performance");
  });

  it("falls back to Next 1-1 when the linked tab is not offered", () => {
    expect(resolveCoachTab("insights", nothing)).toBe("next");
  });

  it("falls back to Next 1-1 on a tab id that does not exist", () => {
    expect(resolveCoachTab("nonsense", { meetings: 9, reviews: 9, trends: 9, checkins: 9 })).toBe("next");
  });
});
