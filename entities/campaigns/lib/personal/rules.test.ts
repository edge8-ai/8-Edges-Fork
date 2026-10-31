import { describe, expect, it } from "vitest";
import { dueReason, hasNews, landingStatus, validationErrors } from "./rules";
import type { Fact } from "./types";

const now = new Date("2026-09-18T08:00:00Z");

describe("dueReason", () => {
  it("is due with no history", () => {
    expect(dueReason(null, 14, now)).toBeNull();
  });
  it("is not due while a message is queued", () => {
    expect(dueReason({ status: "held", createdAt: "2026-09-17T08:00:00Z", sentAt: null }, 14, now)).toBe("already held");
  });
  it("is not due inside the cadence, and a skip parks the person the same way", () => {
    expect(dueReason({ status: "sent", createdAt: "2026-09-01T00:00:00Z", sentAt: "2026-09-10T08:00:00Z" }, 14, now)).toMatch(/sent 8 days ago/);
    expect(dueReason({ status: "skipped", createdAt: "2026-09-16T08:00:00Z", sentAt: null }, 14, now)).toMatch(/skipped 2 days ago/);
  });
  it("is due once the cadence has passed", () => {
    expect(dueReason({ status: "sent", createdAt: "2026-08-01T00:00:00Z", sentAt: "2026-09-01T08:00:00Z" }, 14, now)).toBeNull();
  });
});

describe("hasNews", () => {
  const facts: Fact[] = [{ date: "2026-09-10", fact: "Completed module 3", source: "learner_progress" }];
  it("is news when never written to", () => {
    expect(hasNews(facts, null)).toBe(true);
  });
  it("is not news when every fact predates the last send", () => {
    expect(hasNews(facts, "2026-09-12T08:00:00Z")).toBe(false);
  });
  it("is news when a fact is newer than the last send", () => {
    expect(hasNews(facts, "2026-09-09T08:00:00Z")).toBe(true);
  });
  it("is never news with no facts", () => {
    expect(hasNews([], null)).toBe(false);
  });
});

describe("validationErrors", () => {
  const facts: Fact[] = [
    { date: "2026-09-10", fact: "Completed 4 of 6 courses on the AI Officer track", source: "learner_progress" },
    { date: "2026-09-12", fact: "Attended 2 of 4 coaching sessions", source: "coaching" },
  ];
  const base = {
    subject: "Two courses to go",
    bodyMd: "Hi Mai,\n\nYou have completed 4 of 6 courses. Two to go.\n\nDave",
    factsUsed: [facts[0].fact],
    facts,
    skillMd: "Under 150 words.",
    maxWords: 150,
    firstName: "Mai",
  };

  it("passes a message that cites a gathered fact and states only its numbers", () => {
    expect(validationErrors(base)).toEqual([]);
  });
  it("holds a number that is in no cited fact", () => {
    expect(validationErrors({ ...base, bodyMd: "Hi Mai,\n\nYou have completed 5 of 6 courses.\n\nDave" })).toEqual([
      "States a number that is in no cited fact: 5.",
    ]);
  });
  it("holds a fact the writer cites but never gathered", () => {
    const errors = validationErrors({ ...base, factsUsed: ["Won the hackathon"] });
    expect(errors[0]).toMatch(/not gathered/);
  });
  it("holds a placeholder, an em dash, the missing name and an over-long body", () => {
    const errors = validationErrors({
      ...base,
      bodyMd: `Hi {first_name} — ${"word ".repeat(160)}`,
      firstName: "Mai",
    });
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/^Body is 16\d words/),
      "A placeholder was left in: {first_name}.",
      expect.stringMatching(/em dash/i),
      "The body never addresses Mai by name.",
    ]));
  });
  it("holds a message that cites nothing when facts were gathered", () => {
    expect(validationErrors({ ...base, factsUsed: [], bodyMd: "Hi Mai,\n\nHope you are well.\n\nDave" })).toEqual([
      "Cites no gathered fact; a personal email says something about the person.",
    ]);
  });
});

describe("landingStatus", () => {
  it("holds everything in hold_all", () => {
    expect(landingStatus("hold_all", 5, 7).status).toBe("held");
  });
  it("holds the sample and drafts the rest in sample mode", () => {
    expect(landingStatus("sample", 2, 0)).toEqual({ status: "held", holdReason: "review: sample 1 of 2 for this run" });
    expect(landingStatus("sample", 2, 1).status).toBe("held");
    expect(landingStatus("sample", 2, 2)).toEqual({ status: "drafted", holdReason: null });
  });
});
