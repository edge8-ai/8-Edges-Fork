import { describe, expect, it } from "vitest";
import { inTuesdayWindow } from "./zoom-transcripts-tuesday";

// The schedule fires every 15 minutes from 14:00 to 16:45 UTC on Tuesdays;
// only 14:15 to 16:00 UTC (21:15 to 23:00 Saigon) runs the ingest.

const at = (hhmm: string) => new Date(`2026-11-10T${hhmm}:00Z`);

describe("inTuesdayWindow", () => {
  it("runs from 14:15 to 16:00 UTC inclusive", () => {
    for (const t of ["14:15", "14:30", "15:00", "15:45", "16:00"]) expect(inTuesdayWindow(at(t))).toBe(true);
  });

  it("skips the slots the cron expression adds either side", () => {
    for (const t of ["14:00", "16:15", "16:30", "16:45"]) expect(inTuesdayWindow(at(t))).toBe(false);
  });
});
