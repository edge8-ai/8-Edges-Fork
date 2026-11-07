import { describe, expect, it } from "vitest";
import { buildRun, type Cell } from "./engine";
import { parseProfile, type Profile } from "./profile";

// Every fixture goes through the schema, so the engine is never tested on a
// profile the editor would refuse to save.
function mustParse(input: Profile): Profile {
  const parsed = parseProfile(input);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.profile;
}

// An invented warehouse with the same rule shapes the first client's spec
// uses: a sized line in three bands, one of them a choice the operator makes
// at the shelf; a line that is read only when a UK size is present; two
// exclusions; one pick zone and two reserve zones walked in order. Expected
// values come from that spec's worked examples, not from the engine.
const profile = mustParse({
  columns: { item: "Item", description: "Description", location: "Bin", qty: "On hand" },
  truncatedAtOrBelow: 10,
  zones: [
    { id: "pick", label: "Pick face", role: "pick", rank: 0, pattern: "^P(?<aisle>\\d{2})-(?<bay>\\d{2})-(?<shelf>\\d{2})$", walk: ["aisle", "bay", "shelf"] },
    { id: "upper", label: "Upper", role: "reserve", rank: 0, pattern: "^U(?<aisle>\\d{2})-(?<bay>\\d{2})$", walk: ["aisle", "bay"] },
    { id: "pallet", label: "Pallet", role: "reserve", rank: 1, pattern: "^R(?<rack>\\d)-(?<bay>\\d{2})-(?<shelf>\\d)$", walk: ["rack", "bay", "shelf"] },
  ],
  exclude: [
    { contains: "socks", label: "Socks" },
    { regex: "\\b\\d{2}\\s*-\\s*\\d{2}\\b", label: "A size range" },
  ],
  rules: [
    {
      id: "kestrel",
      label: "Kestrel",
      enabled: true,
      when: [{ contains: "kestrel", label: "Kestrel" }],
      size: "(?<size>\\d{2})\\s*(R|N|W)\\s*$",
      bands: [
        { label: "EU 36-42", min: 36, max: 42, reorderBelow: 24, move: { kind: "fixed", qty: 12 } },
        { label: "EU 43-44", min: 43, max: 44, reorderBelow: 16, move: { kind: "choice", options: [8, 12] } },
        { label: "EU 45+", min: 45, reorderBelow: 16, move: { kind: "fixed", qty: 8 } },
      ],
    },
    {
      id: "ridgeline",
      label: "Ridgeline",
      enabled: true,
      when: [{ contains: "ridgeline", label: "Ridgeline" }],
      require: [{ regex: "\\bUK\\s*\\d+(\\.\\d+)?\\b", label: "UK size" }],
      bands: [{ label: "UK sizes", reorderBelow: 10, move: { kind: "fixed", qty: 20 } }],
    },
  ],
  destinations: { count: 3, from: "furthest" },
  words: {
    pick: "Pick face",
    reserve: "Reserve",
    instructions: ["Work the jobs in order."],
    destinationRule: "Start with Destination 1.",
    noPickNote: "No pick BIN yet. Use any BIN in the size zone.",
    choiceHint: "The box decides.",
    footer: null,
  },
});

const HEADER = ["Item", "Description", "Bin", "On hand"];
const rows = (...body: Cell[][]): Cell[][] => [HEADER, ...body];

describe("buildRun", () => {
  it("makes a job moving the standard amount when pick stock is under the band's threshold", () => {
    const run = buildRun(profile, rows(
      ["KES-38", "Kestrel Arlo Black 38R", "P03-02-04", 23],
      ["KES-38", "Kestrel Arlo Black 38R", "U05-02", 30],
    ));
    expect(run.jobs).toEqual([
      {
        item: "KES-38",
        description: "Kestrel Arlo Black 38R",
        rule: "Kestrel",
        band: "EU 36-42",
        pick: "23",
        reserve: "30",
        move: "12",
        collect: [{ location: "U05-02", qty: "30" }],
        destinations: ["P03-02-04"],
      },
    ]);
  });

  // The client spec's worked examples, one per line: the description picks
  // the line and band, then pick and reserve totals decide whether there is a
  // job and what it moves. `null` is "no replenishment".
  it.each([
    ["Kestrel Arlo 38R", 23, 30, "12"],
    ["Kestrel Arlo 38R", 10, 7, "7"],
    ["Kestrel Arlo 38R", 24, 30, null],
    ["Kestrel Arlo 43N", 12, 30, "8 or 12"],
    ["Kestrel Arlo 43N", 12, 10, "8 or 10"],
    ["Kestrel Arlo 44W", 12, 5, "5"],
    ["Kestrel Arlo 44W", 16, 30, null],
    ["Kestrel Arlo 45R", 15, 20, "8"],
    ["Kestrel Arlo 46R", 6, 5, "5"],
    ["Kestrel Arlo 45R", 16, 20, null],
    ["Ridgeline Trail Boot UK7", 9, 30, "20"],
    ["Ridgeline Trail Boot UK 7.5", 4, 14, "14"],
    ["Ridgeline Trail Boot UK7", 10, 30, null],
  ])("%s with pick %d and reserve %d moves %s", (description, pick, reserve, move) => {
    const run = buildRun(profile, rows(["X-1", description, "P03-02-04", pick], ["X-1", description, "U05-02", reserve]));
    expect(run.jobs.map((j) => j.move)).toEqual(move === null ? [] : [move]);
  });

  it("makes a job with no destinations for an item that has no pick BIN yet", () => {
    const run = buildRun(profile, rows(["K-3", "Kestrel Arlo 41R", "U06-01", 30]));
    expect(run.jobs.map((j) => [j.pick, j.move, j.destinations])).toEqual([["0", "12", []]]);
  });

  it("lists every item held in reserve that the profile cannot read, with the reason, and makes no job of it", () => {
    const run = buildRun(profile, rows(
      ["S-1", "Kestrel Cotton Socks", "U01-01", 10],
      ["S-2", "Kestrel Footbed 42-44", "U01-02", 10],
      ["S-3", "Ridgeline Trail Boot AU 12 KIDS", "U01-03", 10],
      ["S-4", "kestrel lace-up no size code", "U01-04", 10],
      ["S-5", "Kestrel Arlo 34R", "U01-05", 10],
      ["S-6", "Harbour Sandal 40R", "U01-06", 10],
    ));
    expect(run.jobs).toEqual([]);
    expect(run.leftOut).toEqual([
      { item: "S-1", description: "Kestrel Cotton Socks", reason: "Socks" },
      { item: "S-2", description: "Kestrel Footbed 42-44", reason: "A size range" },
      { item: "S-3", description: "Ridgeline Trail Boot AU 12 KIDS", reason: "Ridgeline: no UK size" },
      { item: "S-4", description: "kestrel lace-up no size code", reason: "Kestrel: size not readable" },
      { item: "S-5", description: "Kestrel Arlo 34R", reason: "Kestrel: size 34 is outside every band" },
      { item: "S-6", description: "Harbour Sandal 40R", reason: "No rule applies" },
    ]);
  });

  it("does not list an unreadable item that holds no reserve stock, since it could never have been a job", () => {
    const run = buildRun(profile, rows(["H-1", "Shoe horn", "P02-01-01", 4]));
    expect(run.leftOut).toEqual([]);
  });

  it("treats a switched-off rule as absent", () => {
    const off = { ...profile, rules: profile.rules.map((r) => (r.id === "ridgeline" ? { ...r, enabled: false } : r)) };
    const run = buildRun(off, rows(["R-1", "Ridgeline Trail UK7", "U01-01", 30]));
    expect(run.jobs).toEqual([]);
    expect(run.leftOut.map((e) => e.reason)).toEqual(["No rule applies"]);
  });

  it("counts only stock above zero in a known zone, and sums rows that share an item and a BIN", () => {
    const d = "Kestrel Arlo 39R";
    const run = buildRun(profile, rows(
      ["K-1", d, "P02-01-01", 3],
      ["K-1", d, "P02-01-02", 0],
      ["K-1", d, "P02-01-03", -2],
      ["K-1", d, "P02-01-04", ""],
      ["K-1", d, "P02-01-05", "n/a"],
      ["K-1", d, "P11-09-01x", 50],
      ["K-1", d, "RECEIVING", 50],
      ["K-1", d, null, 50],
      ["K-1", d, " U04-03 ", 4],
      ["K-1", d, "U04-03", 6],
      ["K-1", d, "U04-04", "2.5"],
    ));
    expect(run.jobs).toHaveLength(1);
    const [job] = run.jobs;
    expect([job.pick, job.reserve, job.move]).toEqual(["3", "12.5", "12"]);
    expect(job.collect).toEqual([{ location: "U04-03", qty: "10" }, { location: "U04-04", qty: "2.5" }]);
    expect(job.destinations).toEqual(["P02-01-01"]);
  });

  it("shows summed fractional quantities as the operator would write them, with no arithmetic noise", () => {
    const d = "Kestrel Arlo 39R";
    const run = buildRun(profile, rows(["K-1", d, "U04-03", 1.1], ["K-1", d, "U04-03", 2.2], ["K-1", d, "U04-04", 0.1], ["K-1", d, "U04-04", 0.2]));
    const [job] = run.jobs;
    expect(job.collect).toEqual([{ location: "U04-03", qty: "3.3" }, { location: "U04-04", qty: "0.3" }]);
    expect([job.reserve, job.move]).toEqual(["3.6", "3.6"]);
  });

  it("takes an item's description from the first counted row that has one", () => {
    const run = buildRun(profile, rows(
      ["K-2", "", "U01-01", 30],
      ["K-2", "Kestrel Arlo 40R", "U01-02", 1],
      ["K-2", "Kestrel Arlo 40R renamed", "U01-03", 1],
    ));
    expect(run.jobs.map((j) => j.description)).toEqual(["Kestrel Arlo 40R"]);
  });

  it("lists collection BINs in walking order: every upper BIN before any pallet, then aisle, bay and shelf as numbers", () => {
    const d = "Kestrel Arlo 39R";
    const run = buildRun(profile, rows(
      ["K-1", d, "R1-01-1", 1],
      ["K-1", d, "U10-01", 1],
      ["K-1", d, "U02-08", 1],
      ["K-1", d, "U02-10", 1],
      ["K-1", d, "R1-01-2", 1],
    ));
    expect(run.jobs[0].collect.map((c) => c.location)).toEqual(["U02-08", "U02-10", "U10-01", "R1-01-1", "R1-01-2"]);
  });

  it("walks a BIN whose optional walk group did not match before the ones that did, in a stable order", () => {
    const d = "Kestrel Arlo 39R";
    const optional = {
      ...profile,
      zones: profile.zones.map((z) => (z.id === "upper" ? { ...z, pattern: "^U(?<aisle>\\d{2})-(?<bay>\\d{2})(-(?<shelf>\\d))?$", walk: ["aisle", "bay", "shelf"] } : z)),
    };
    const run = buildRun(optional, rows(
      ["K-1", d, "U02-01-2", 1],
      ["K-1", d, "U02-01", 1],
      ["K-1", d, "U02-01-1", 1],
      ["K-1", d, "U01-09", 1],
      ["K-1", d, "U02-02", 1],
    ));
    expect(run.jobs[0].collect.map((c) => c.location)).toEqual(["U01-09", "U02-01", "U02-01-1", "U02-01-2", "U02-02"]);
  });

  it("suggests the furthest pick BINs first, at most as many as the profile asks for", () => {
    const d = "Kestrel Arlo 39R";
    const run = buildRun(profile, rows(
      ["K-1", d, "P02-01-01", 1],
      ["K-1", d, "P10-08-08", 1],
      ["K-1", d, "P05-03-06", 1],
      ["K-1", d, "P05-03-07", 1],
      ["K-1", d, "U01-01", 30],
    ));
    expect(run.jobs[0].destinations).toEqual(["P10-08-08", "P05-03-07", "P05-03-06"]);
    const nearest = buildRun({ ...profile, destinations: { count: 2, from: "nearest" } }, rows(
      ["K-1", d, "P05-03-06", 1],
      ["K-1", d, "P02-01-01", 1],
      ["K-1", d, "P10-08-08", 1],
      ["K-1", d, "U01-01", 30],
    ));
    expect(nearest.jobs[0].destinations).toEqual(["P02-01-01", "P05-03-06"]);
  });

  it("orders jobs by their first collection BIN along the walk, then by item code as plain text", () => {
    const d = "Kestrel Arlo 39R";
    const run = buildRun(profile, rows(
      ["Z-1", d, "R1-01-1", 30],
      ["b-2", d, "U03-01", 30],
      ["B-9", d, "U03-01", 30],
      ["B-10", d, "U03-01", 30],
      ["A-1", d, "U07-01", 30],
      ["A-1", d, "U01-05", 30],
    ));
    expect(run.jobs.map((j) => j.item)).toEqual(["A-1", "B-10", "B-9", "b-2", "Z-1"]);
  });

  it("finds columns by heading in any position and ignores the others", () => {
    const run = buildRun(profile, [
      ["Warehouse", " On hand ", "Bin", "Description", "Item"],
      ["W1", 30, "U01-01", "Kestrel Arlo 39R", "K-1"],
    ]);
    expect(run.jobs.map((j) => [j.item, j.reserve])).toEqual([["K-1", "30"]]);
  });

  it("refuses an export missing a column, naming the heading", () => {
    expect(() => buildRun(profile, [["Item", "Description", "On hand"], ["K-1", "Kestrel Arlo 39R", 3]])).toThrow(/"Bin"/);
  });

  it("counts every non-blank data row before filtering, and flags the export at or under the threshold", () => {
    const body: Cell[][] = Array.from({ length: 10 }, (_, i) => [`H-${i}`, "Shoe horn", "RECEIVING", 1]);
    const atThreshold = buildRun(profile, [HEADER, ...body, [null, null, null, null], []]);
    expect([atThreshold.dataRows, atThreshold.truncated]).toEqual([10, true]);
    const over = buildRun(profile, [HEADER, ...body, ["H-x", "Shoe horn", "RECEIVING", 1]]);
    expect([over.dataRows, over.truncated]).toEqual([11, false]);
    const never = buildRun({ ...profile, truncatedAtOrBelow: null }, [HEADER, ...body]);
    expect(never.truncated).toBe(false);
  });

  it("returns an empty run, not an error, when nothing needs restocking", () => {
    const run = buildRun(profile, rows(["K-1", "Kestrel Arlo 39R", "P02-01-01", 40], ["K-1", "Kestrel Arlo 39R", "U01-01", 30]));
    expect([run.jobs, run.leftOut]).toEqual([[], []]);
  });

  it("names the line and band that decided the job", () => {
    const run = buildRun(profile, rows(["X-1", "Kestrel Arlo 43N", "U05-02", 30], ["X-2", "Ridgeline Trail UK9", "U05-03", 30]));
    expect(run.jobs.map((j) => [j.item, j.rule, j.band])).toEqual([["X-1", "Kestrel", "EU 43-44"], ["X-2", "Ridgeline", "UK sizes"]]);
  });
});
