import { describe, expect, it } from "vitest";
import { inThursdayWindow } from "./zoom-transcripts-thursday";

// The schedule fires every 15 minutes from 04:00 to 05:45 UTC on Thursdays;
// only 04:30 to 05:30 UTC (11:30 to 12:30 Saigon) runs the ingest.

const at = (hhmm: string) => new Date(`2026-10-15T${hhmm}:00Z`);

describe("inThursdayWindow", () => {
  it("runs from 04:30 to 05:30 UTC inclusive", () => {
    for (const t of ["04:30", "04:45", "05:00", "05:15", "05:30"]) expect(inThursdayWindow(at(t))).toBe(true);
  });

  it("skips the slots the cron expression adds either side", () => {
    for (const t of ["04:00", "04:15", "05:45"]) expect(inThursdayWindow(at(t))).toBe(false);
  });
});
