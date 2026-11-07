import { describe, expect, it } from "vitest";
import { WAREHOUSE_PROFILE } from "./__fixtures__/warehouse";
import { parseProfile } from "./profile";
import {
  bandCounts,
  binWords,
  finishedBy,
  jobProgress,
  jobsFilterOf,
  jobsShown,
  operatorWords,
  runChecks,
  runDate,
  runDay,
  shortDay,
  statusWords,
  workedByWords,
} from "./run-view";

// What a run's page says (RP.4): the checks a manager reads before sending,
// and how many jobs each band produced, every band listed even at zero.
const parsed = parseProfile(WAREHOUSE_PROFILE);
if (!parsed.ok) throw new Error(parsed.error);
const profile = parsed.profile;

describe("runChecks", () => {
  it("says how many rows were read and that nothing was cut off", () => {
    const checks = runChecks({ dataRows: 1200, truncated: false, leftOut: [1, 2] }, { reserve: "Reserve" });
    expect(checks).toEqual([
      { ok: true, text: "All four columns found" },
      { ok: true, text: "1,200 rows read, so not cut off" },
      { ok: true, text: "2 items held in Reserve left out, each with its reason" },
      { ok: true, text: "Every location outside the zones ignored" },
    ]);
  });

  it("flags an export small enough to have been cut off", () => {
    const [, rows] = runChecks({ dataRows: 3, truncated: true, leftOut: [] }, { reserve: "Reserve" });
    expect(rows).toEqual({ ok: false, text: "Only 3 rows: the export may have been cut off. Export it again before sending." });
  });
});

describe("bandCounts", () => {
  it("counts the jobs of every enabled band in the profile's order, zero included", () => {
    expect(bandCounts(profile, [{ rule: "Kestrel", band: "EU 43-44" }, { rule: "Kestrel", band: "EU 43-44" }])).toEqual([
      { label: "Kestrel EU 36-42", jobs: 0 },
      { label: "Kestrel EU 43-44", jobs: 2 },
    ]);
  });

  it("lists every band at zero for an empty run", () => {
    expect(bandCounts(profile, []).map((b) => b.jobs)).toEqual([0, 0]);
  });

  it("leaves a draft rule out, and still counts a job its snapshot does not name", () => {
    const drafted = { ...profile, rules: profile.rules.map((r) => ({ ...r, enabled: false })) };
    expect(bandCounts(drafted, [{ rule: "Old", band: "UK" }])).toEqual([{ label: "Old UK", jobs: 1 }]);
  });
});

describe("the run's words", () => {
  it("names the day in the business time zone", () => {
    // 20:30 UTC on Wednesday is Thursday morning in Saigon.
    expect(runDay("2026-10-28T20:30:00Z")).toBe("Thursday 29 Oct");
  });

  it("tells a draft from a sent run", () => {
    expect(statusWords("draft")).toEqual({ text: "Draft: scanners can't see it yet", tone: "warn" });
    expect(statusWords("sent").text).toBe("Sent to scanners");
  });

  it("uses the snapshot's words for the two kinds of BIN, and plain ones without it", () => {
    expect(binWords(profile)).toEqual({ pick: "Pick face", reserve: "Reserve" });
    expect(binWords(null)).toEqual({ pick: "Pick", reserve: "Reserve" });
  });

  it("gives the scanner the run's short date and the day in the business time zone", () => {
    expect(runDate("2026-10-28T20:30:00Z")).toBe("29 Oct");
    expect(shortDay("2026-10-28T20:30:00Z")).toBe("Thu 29 Oct");
  });

  it("gives the scanner the snapshot's own words, and plain ones when the snapshot cannot be read", () => {
    expect(operatorWords(profile)).toEqual(profile.words);
    const plain = operatorWords(null);
    expect(plain.pick).toBe("Pick");
    expect(plain.instructions.length).toBeGreaterThan(0);
    expect(plain.footer).toBeNull();
  });
});

// Tracking a run (RP.7): who finished each job, when and with which BIN.
const open = (id: string) => ({ id, doneAt: null, binUsed: null, doneBy: null });
const finished = (id: string, bin: string, by: string | null) => ({ id, doneAt: "2026-10-29T03:42:00Z", binUsed: bin, doneBy: by });
const PEOPLE = new Map([["dana", { name: "Dana Pham" }], ["sam", { name: "Sam Nguyen" }]]);

describe("finishedBy", () => {
  it("names the BIN scanned, the person and the time, in the business time zone", () => {
    expect(finishedBy(finished("j1", "P03-02", "dana"), PEOPLE)).toEqual({ bin: "P03-02", who: "Dana Pham", when: "Thu 29 Oct, 10:42" });
  });

  it("is null while the job is open", () => {
    expect(finishedBy(open("j1"), PEOPLE)).toBeNull();
  });

  it("still shows a finished job whose person is no longer on record", () => {
    expect(finishedBy(finished("j1", "P03-02", "gone"), PEOPLE)?.who).toBe("Someone no longer on record");
    expect(finishedBy(finished("j1", "P03-02", null), PEOPLE)?.who).toBe("Someone no longer on record");
  });
});

describe("jobProgress", () => {
  it("counts the done and open jobs, the bar in tens rounded down", () => {
    const jobs = [finished("a", "1", "dana"), finished("b", "2", "dana"), open("c")];
    expect(jobProgress(jobs)).toEqual({ total: 3, done: 2, open: 1, step: 60 });
  });

  it("reads full only when every job is done, and empty for an empty run", () => {
    const almost = [...Array.from({ length: 19 }, (_, i) => finished(`d${i}`, "B", "sam")), open("last")];
    expect(jobProgress(almost).step).toBe(90);
    expect(jobProgress([finished("a", "1", "sam")]).step).toBe(100);
    expect(jobProgress([])).toEqual({ total: 0, done: 0, open: 0, step: 0 });
  });
});

describe("jobsShown", () => {
  const jobs = [open("a"), finished("b", "1", "sam"), open("c")];

  it("keeps the open or the done jobs, in walking order", () => {
    expect(jobsShown(jobs, "open").map((j) => j.id)).toEqual(["a", "c"]);
    expect(jobsShown(jobs, "done").map((j) => j.id)).toEqual(["b"]);
    expect(jobsShown(jobs, null).map((j) => j.id)).toEqual(["a", "b", "c"]);
  });

  it("reads only the two filters from the address, anything else lists every job", () => {
    expect([jobsFilterOf("open"), jobsFilterOf("done"), jobsFilterOf("all"), jobsFilterOf(undefined)]).toEqual(["open", "done", null, null]);
  });
});

describe("workedByWords", () => {
  it("names who worked a run, in the order given, or a dash when nobody has yet", () => {
    expect(workedByWords(["sam", "dana"], PEOPLE)).toBe("Sam Nguyen, Dana Pham");
    expect(workedByWords([], PEOPLE)).toBe("—");
  });
});
