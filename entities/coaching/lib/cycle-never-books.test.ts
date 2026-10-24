import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 2026-09-25: the daily coaching pass booked 1-1s on days it worked out from
// the cadence and put Lark invites on them, so two people got invites for
// meetings nobody had agreed. A routine never books a 1-1 and never touches a
// calendar; only a person books. Since ADR-0010 it writes no part of the
// schedule at all: the Wednesday guess it wrote to the profile each morning
// read as a booking on every page. This pins it on the source, because the
// calls that did it read perfectly reasonably and would come back one
// "helpful" step at a time.
const ROUTINE_FILES = ["entities/coaching/lib/cycle.ts", "entities/coaching/crons/coaching-cycle.ts"];

describe("the daily coaching pass", () => {
  for (const file of ROUTINE_FILES) {
    const src = readFileSync(file, "utf8");

    it(`${file} touches no calendar`, () => {
      expect(src).not.toMatch(/lark-hold|lark-calendar|syncLarkHold/);
    });

    it(`${file} books no 1-1`, () => {
      expect(src).not.toMatch(/\.insert\(\s*\{[^}]*held_on/);
    });

    it(`${file} writes no part of the schedule`, () => {
      // No date on the profile, no move of a booking, no held-late stamp: the
      // suggested date is computed when a page reads it.
      expect(src).not.toMatch(/next_one_on_one_on|preferred_weekday|missed_at|marked_held_on/);
      expect(src).not.toMatch(/applyMeetingMove|patchMeeting|coachMarkOneOnOneHeld/);
      expect(src).not.toMatch(/\.update\(\s*\{[^}]*held_on/);
    });
  }
});
