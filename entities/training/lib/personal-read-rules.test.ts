import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Outcome } from "./outcomes";
import { checkRead, readInput, readSince, readState, readUsedLine, reviewsSoFar, READ_WAKES_AT, type ReadInputs } from "./personal-read-rules";
import type { MyTrainingRow } from "./training-rules";

const NOW = new Date("2026-11-04T05:00:00.000Z");

function row(over: Partial<MyTrainingRow> = {}): MyTrainingRow {
  return {
    attendanceId: "a",
    trainingId: "t",
    title: "Prompting basics",
    typeId: "class",
    typeName: "Class",
    typeRank: 0,
    organiserName: "An Organiser",
    startsAt: "2026-10-05T09:00:00.000Z",
    endsAt: "2026-10-05T10:00:00.000Z",
    selfLogged: false,
    status: "attended",
    source: "member",
    skipReason: null,
    answeredAt: null,
    review: { stars: 4, load: "too_much", tags: ["useful"], note: "Fast but good", signed: false },
    loggedAt: "2026-10-01T00:00:00.000Z",
    ...over,
  } as MyTrainingRow;
}

const outcome: Outcome = { id: "o", happenedOn: "2026-10-20", description: "Shipped my first agent", source: "member", suggestedBy: null, certificationTrack: null, credits: [{ kind: "training", id: "t" }] };
const inputs = (over: Partial<ReadInputs> = {}): ReadInputs => ({ rows: [row()], outcomes: [outcome], plans: [], finishedCards: ["2026-10-06T00:00:00.000Z", "2026-10-07T00:00:00.000Z"], mergedPullRequests: ["2026-10-08T00:00:00.000Z"], now: NOW, ...over });

describe("when the read wakes (story 33)", () => {
  it("stays quiet below five reviews even when the address asks for it", () => {
    expect(readState(READ_WAKES_AT - 1, true)).toBe("quiet");
    expect(readState(0, false)).toBe("quiet");
  });

  it("is sealed at five, and written only when opened", () => {
    expect(readState(READ_WAKES_AT, false)).toBe("sealed");
    expect(readState(READ_WAKES_AT, true)).toBe("open");
  });

  it("counts only reviews inside the last twelve months, on trainings that have started", () => {
    const rows = [row(), row({ startsAt: "2025-01-01T09:00:00.000Z", endsAt: "2025-01-01T10:00:00.000Z" }), row({ startsAt: "2026-12-01T09:00:00.000Z", endsAt: "2026-12-01T10:00:00.000Z" }), row({ review: null, status: "skipped" })];
    expect(reviewsSoFar(rows, NOW)).toBe(1);
  });
});

describe("what the model is told", () => {
  it("states the member's record, and the work beside it week by week", () => {
    const text = readInput(inputs());
    expect(text).toContain('2026-10-05 · Class · "Prompting basics" · 60 min · went · 4 stars · load too much');
    expect(text).toContain('note: "Fast but good"');
    expect(text).toContain("- Class: 1 trainings, went 1, 1 reviews, average 4.0 stars");
    expect(text).toContain('- 2026-10-20: "Shipped my first agent" (credited: "Prompting basics")');
    expect(text).toContain("- 2026-10-05: 60 min trained, 2 cards finished, 1 pull requests merged");
  });

  it("never names the organiser", () => {
    expect(readInput(inputs())).not.toContain("An Organiser");
  });

  it("leaves the work out where the deployment has no such signal, rather than saying zero", () => {
    const text = readInput(inputs({ finishedCards: null, mergedPullRequests: null }));
    expect(text).toContain("- 2026-10-05: 60 min trained");
    expect(text).not.toMatch(/cards finished|pull requests merged/);
    expect(readUsedLine(inputs({ finishedCards: null, mergedPullRequests: null }))).toBe("Read from 1 review, 1 training and 1 outcome, over the last 12 months.");
  });

  it("says what it read from, counting only the work inside the window", () => {
    const old = new Date(new Date(readSince(NOW)).getTime() - 1000).toISOString();
    expect(readUsedLine(inputs({ finishedCards: [old, "2026-10-06T00:00:00.000Z"] }))).toBe("Read from 1 review, 1 training and 1 outcome, 1 finished card and 1 pull request, over the last 12 months.");
  });
});

describe("the line that says what it read from", () => {
  it("counts in the plural past one, and at none", () => {
    const old = "2026-10-06T00:00:00.000Z";
    expect(readUsedLine(inputs({ rows: [row(), row()], outcomes: [], finishedCards: [old, old], mergedPullRequests: [] }))).toBe("Read from 2 reviews, 2 trainings and 0 outcomes, 2 finished cards and 0 pull requests, over the last 12 months.");
  });
});

describe("the card's button (found by the live test of 2026-11-04)", () => {
  // A link inherits `.admin-shell a` (one class and one element), which beats a
  // one-class rule: the button drew blue on blue, with no label to read.
  it("names the link in its colour rules, so they outrank the shell's link colour", () => {
    const css = readFileSync(join(process.cwd(), "app/styles/training.css"), "utf8");
    expect(css).toMatch(/\.tr-yr a\.tr-yr-btn \{[^}]*color: var\(--color-bg-primary\)/);
    expect(css).toMatch(/\.tr-yr a\.tr-yr-btn:hover \{[^}]*color: var\(--color-bg-primary\)/);
  });
});

describe("the check every read passes", () => {
  const input = readInput(inputs());
  const good = { headline: "Classes seem to land for you.", noticed: ["You gave it 4 stars and said the load was too much."], worthTrying: null };

  it("keeps a read whose every number was in its input, and tidies spacing", () => {
    expect(checkRead({ ...good, headline: "  Classes  seem to land for you. " }, input)).toEqual({ ok: true, read: good });
  });

  it("refuses a read that invents a number", () => {
    expect(checkRead({ ...good, noticed: ["You went to 7 classes."] }, input).ok).toBe(false);
    expect(checkRead({ ...good, worthTrying: "Aim for 3 sessions." }, input).ok).toBe(false);
  });

  it("refuses a number written in words, which the check cannot see", () => {
    expect(checkRead({ ...good, headline: "Twice as good as before." }, input).ok).toBe(false);
  });

  it("does not take a date's digits as figures it was given", () => {
    expect(checkRead({ ...good, noticed: ["You went to 20 classes."] }, input).ok).toBe(false);
    expect(checkRead({ ...good, noticed: ["You went to 10 classes."] }, input).ok).toBe(false);
  });

  it("refuses a read that does not fit the card", () => {
    expect(checkRead({ ...good, headline: " " }, input).ok).toBe(false);
    expect(checkRead({ ...good, noticed: [] }, input).ok).toBe(false);
    expect(checkRead({ ...good, noticed: ["a", "b", "c", "d"] }, input).ok).toBe(false);
    expect(checkRead({ ...good, noticed: ["a".repeat(321)] }, input).ok).toBe(false);
  });
});

describe("never stored (ADR 0016)", () => {
  it("the module that writes the read touches no table, and logs no message", () => {
    const source = readFileSync(join(__dirname, "personal-read.ts"), "utf8");
    expect(source).not.toMatch(/\.from\(|kernel\/data|\.insert\(|\.upsert\(/);
    expect(source).not.toMatch(/console\./);
    expect(source).not.toMatch(/\.message\b/);
  });
});
