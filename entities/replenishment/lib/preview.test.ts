import { describe, expect, it } from "vitest";
import { WAREHOUSE_PROFILE } from "./__fixtures__/warehouse";
import type { Cell } from "./engine";
import { jobsChange, previewRun, tryLocation } from "./preview";
import { parseProfile, type Profile } from "./profile";

// The profile editor's preview (RP.6), through its public functions over an
// invented export: what the manager sees recount as a draft changes.
function mustParse(input: unknown): Profile {
  const parsed = parseProfile(input);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.profile;
}

const profile = mustParse(WAREHOUSE_PROFILE);

const EXPORT: Cell[][] = [
  ["Item", "Description", "Bin", "On hand"],
  ["KES-38", "Kestrel Arlo Black 38R", "P03-02", 23],
  ["KES-38", "Kestrel Arlo Black 38R", "U05", 30],
  ["KES-40", "Kestrel Arlo Black 40R", "P04-01", 20],
  ["KES-40", "Kestrel Arlo Black 40R", "U06", 10],
  ["KES-44", "Kestrel Arlo Black 44R", "U02", 10],
  ["KES-43", "Kestrel Arlo Black 43R", "P05-01", 15],
  ["KES-43", "Kestrel Arlo Black 43R", "U07", 5],
  ["SOCK-1", "Kestrel socks 38R", "U01", 5],
  ["SOCK-2", "Kestrel socks 40R", "U08", 5],
  ["KES-X", "Kestrel Arlo no size", "U03", 4],
  ["PLN-1", "Plain runner 38R", "U04", 3],
  ["KES-38", "Kestrel Arlo Black 38R", "DOCK", 99],
];

const withThreshold = (reorderBelow: number): Profile => {
  const next = structuredClone(profile);
  next.rules[0].bands[0].reorderBelow = reorderBelow;
  return next;
};

describe("previewRun", () => {
  it("counts the jobs, the jobs of each band, the left-out items by reason and the first jobs in walking order", () => {
    const result = previewRun(profile, EXPORT);
    if (!result.ok) throw new Error(result.error);
    const { preview } = result;
    expect(preview.dataRows).toBe(12);
    expect(preview.truncated).toBe(false);
    expect(preview.jobs).toBe(4);
    expect(preview.bandJobs).toEqual([[2, 2]]);
    expect(preview.leftOut).toBe(4);
    expect(preview.reasons).toEqual([
      { reason: "Socks", count: 2 },
      { reason: "Kestrel: size not readable", count: 1 },
      { reason: "No rule applies", count: 1 },
    ]);
    expect(preview.firstJobs.map((job) => [job.item, job.move])).toEqual([
      ["KES-44", "8 or 10"],
      ["KES-38", "12"],
      ["KES-40", "10"],
      ["KES-43", "5"],
    ]);
  });

  it("a threshold change moves the preview count", () => {
    const before = previewRun(profile, EXPORT);
    const after = previewRun(withThreshold(21), EXPORT);
    if (!before.ok || !after.ok) throw new Error("the preview failed");
    // KES-38 holds 23 in the pick face: below 24, a job; not below 21.
    expect(before.preview.jobs).toBe(4);
    expect(after.preview.jobs).toBe(3);
    expect(after.preview.bandJobs).toEqual([[1, 2]]);
    expect(jobsChange(after.preview.jobs, before.preview.jobs)).toBe("1 fewer than the saved profile.");
  });

  it("answers a column heading the export lacks with the engine's sentence, not an empty preview", () => {
    const draft = structuredClone(profile);
    draft.columns.location = "Location";
    expect(previewRun(draft, EXPORT)).toEqual({ ok: false, error: 'The export has no "Location" column.' });
  });

  it("does not count a turned-off rule's jobs against it", () => {
    const draft = structuredClone(profile);
    draft.rules[0].enabled = false;
    const result = previewRun(draft, EXPORT);
    if (!result.ok) throw new Error(result.error);
    expect(result.preview.jobs).toBe(0);
    expect(result.preview.bandJobs).toEqual([[0, 0]]);
    expect(result.preview.reasons).toContainEqual({ reason: "No rule applies", count: 6 });
  });
});

describe("jobsChange", () => {
  it.each([
    [5, 5, "Same as the saved profile."],
    [7, 5, "2 more than the saved profile."],
    [4, 5, "1 fewer than the saved profile."],
  ])("%i jobs against %i saved reads %j", (draft, saved, words) => {
    expect(jobsChange(draft, saved)).toBe(words);
  });
});

describe("tryLocation", () => {
  it("names the zone a BIN falls in and the parts it is walked by", () => {
    expect(tryLocation(profile.zones, " P03-02 ")).toEqual({ ok: true, text: "Pick face (pick) · aisle 3, bay 2" });
    expect(tryLocation(profile.zones, "U05")).toEqual({ ok: true, text: "Upper (reserve) · aisle 5" });
  });

  it("says a location that fits no zone is ignored", () => {
    expect(tryLocation(profile.zones, "DOCK")).toEqual({ ok: false, text: "Ignored: fits no zone" });
  });

  it("reports a zone whose pattern has an error instead of skipping it", () => {
    const zones = [{ ...profile.zones[0], pattern: "^P(" }, profile.zones[1]];
    expect(tryLocation(zones, "U05")).toEqual({ ok: false, text: "Pick face: the pattern has an error" });
  });
});
