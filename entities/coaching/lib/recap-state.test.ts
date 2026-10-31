import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RECAP_RUN_GRAIN_MINUTES } from "./history-shared";
import { recapState, type RecapMeeting } from "./recap-state";

const meeting = (over: Partial<RecapMeeting>): RecapMeeting => ({
  status: "held",
  archivedAt: null,
  sharedSummaryMarkdown: "The recap.",
  sharedPublishedAt: null,
  updatedAt: "2026-10-14T09:17:00.000Z",
  ...over,
});

describe("recapState (A.60)", () => {
  it.each([
    ["no text at all", meeting({ sharedSummaryMarkdown: null }), { kind: "none" }],
    ["text that is only whitespace", meeting({ sharedSummaryMarkdown: "  \n " }), { kind: "none" }],
    ["text on a 1-1 not marked held", meeting({ status: "scheduled" }), { kind: "draft" }],
    ["text on an archived 1-1", meeting({ archivedAt: "2026-10-14T10:00:00.000Z" }), { kind: "draft" }],
    ["text with no updated_at to count from", meeting({ updatedAt: null }), { kind: "draft" }],
    // 09:17 + 24h is 09:17 the next day; the 09:00 run's cutoff is before it,
    // so the 10:00 run is the one that publishes.
    ["text last touched at 09:17", meeting({}), { kind: "waiting", publishesAt: "2026-10-15T10:00:00.000Z" }],
    // Exactly on the hour: the 09:00 run's cutoff equals updated_at, and `.lt`
    // is strict, so it waits for 10:00 too.
    [
      "text last touched at exactly 09:00",
      meeting({ updatedAt: "2026-10-14T09:00:00.000Z" }),
      { kind: "waiting", publishesAt: "2026-10-15T10:00:00.000Z" },
    ],
    ["a published recap", meeting({ sharedPublishedAt: "2026-10-15T10:00:05.000Z" }), { kind: "published" }],
    [
      "a published recap whose 1-1 was archived after",
      meeting({ sharedPublishedAt: "2026-10-15T10:00:05.000Z", archivedAt: "2026-10-16T00:00:00.000Z" }),
      { kind: "published" },
    ],
  ])("%s", (_label, input, expected) => {
    expect(recapState(input)).toEqual(expected);
  });

  it("runs on the grain the routine is scheduled on", () => {
    // RECAP_RUN_GRAIN_MINUTES (history-shared.ts) mirrors this schedule, and lib
    // cannot import the cron file, so the cron is read as text here. If this
    // fails, change RECAP_RUN_GRAIN_MINUTES and this test together, or every
    // promised recap hour is wrong.
    const cron = readFileSync(new URL("../crons/coaching-recaps.ts", import.meta.url), "utf8");
    const schedule = cron.match(/export const schedule = "([^"]+)";/)?.[1];
    expect(schedule, "coaching-recaps schedule changed: update RECAP_RUN_GRAIN_MINUTES and this test together").toBe(
      "0 * * * *",
    );
    expect(RECAP_RUN_GRAIN_MINUTES).toBe(60);
  });
});
