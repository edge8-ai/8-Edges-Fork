import { describe, expect, it } from "vitest";
import { goalView, middleHalf, shelf, trainingBlock } from "./training-block";
import type { MyTrainingRow } from "./training-rules";

// Tuesday 3 November 2026, 10:00 in Vietnam: the week starts Monday 2 November.
const NOW = new Date("2026-11-03T03:00:00Z");

let n = 0;
function row(day: string, minutes: number, status: MyTrainingRow["status"], typeRank = 0, typeId = `t${typeRank}`): MyTrainingRow {
  const startsAt = `${day}T14:00:00+07:00`;
  const endsAt = new Date(new Date(startsAt).getTime() + minutes * 60000).toISOString();
  n += 1;
  return {
    attendanceId: `a${n}`,
    trainingId: `tr${n}`,
    title: `Training ${n}`,
    typeId,
    typeName: ["Class", "Workshop", "Course", "Talk"][typeRank] ?? "Other",
    typeRank,
    organiserName: null,
    startsAt,
    endsAt,
    selfLogged: false,
    status,
    source: "member",
    skipReason: null,
    answeredAt: null,
    review: null,
    loggedAt: startsAt,
  };
}

describe("trainingBlock", () => {
  it("lays out eight Monday weeks ending this week, in Vietnam time", () => {
    const b = trainingBlock([], null, NOW);
    expect(b.weeks).toHaveLength(8);
    expect(b.weeks[0].monday).toBe("2026-09-14");
    expect(b.weeks[7]).toMatchObject({ monday: "2026-11-02", label: "This week", isNow: true });
    expect(b.weeks[6].label).toBe("26 Oct");
  });

  it("puts a training in the week its Vietnam day falls in, not its UTC day", () => {
    // 06:00 Monday 2 Nov in Vietnam is 23:00 Sunday 1 Nov UTC.
    const early = { ...row("2026-11-02", 60, "attended"), startsAt: "2026-11-01T23:00:00Z", endsAt: "2026-11-02T00:00:00Z" };
    const b = trainingBlock([early], null, NOW);
    expect(b.weeks[7].capsules).toHaveLength(1);
    expect(b.weeks[6].capsules).toHaveLength(0);
  });

  it("draws went, skipped and still-to-come, and counts only went minutes", () => {
    const rows = [row("2026-11-02", 75, "attended"), row("2026-11-03", 75, "skipped"), row("2026-11-05", 45, "pending", 3), row("2026-11-04", 60, "absent")];
    const b = trainingBlock(rows, null, NOW);
    expect(b.weeks[7].capsules.map((c) => c.state)).toEqual(["went", "skipped", "skipped", "waiting"]);
    expect(b.thisWeek).toEqual({ went: 75, waiting: 45 });
    expect(b.weeks[7].capsules[3].tone).toBe("tr-type-3");
  });

  it("leaves out trainings older than eight weeks", () => {
    const b = trainingBlock([row("2026-09-07", 60, "attended")], null, NOW);
    expect(b.weeks.every((w) => w.capsules.length === 0)).toBe(true);
  });

  it("draws no usual week until four past weeks have a training", () => {
    const three = [row("2026-10-05", 60, "attended"), row("2026-10-12", 90, "attended"), row("2026-10-19", 120, "attended")];
    expect(trainingBlock(three, null, NOW).usual).toBeNull();
    const four = [...three, row("2026-10-26", 150, "attended")];
    expect(trainingBlock(four, null, NOW).usual).toEqual({ low: 85, high: 130 });
  });

  it("never counts this week or a week of only skips towards the usual week", () => {
    const rows = [row("2026-10-05", 60, "attended"), row("2026-10-12", 60, "attended"), row("2026-10-19", 60, "attended"), row("2026-10-26", 60, "skipped"), row("2026-11-02", 600, "attended")];
    expect(trainingBlock(rows, null, NOW).usual).toBeNull();
  });

  it("scales the chart to the tallest week, the band and the goal, to the next hour", () => {
    expect(trainingBlock([], null, NOW).scale).toBe(120);
    expect(trainingBlock([row("2026-11-02", 75, "attended"), row("2026-11-03", 75, "attended")], null, NOW).scale).toBe(180);
    expect(trainingBlock([], 200, NOW).scale).toBe(240);
  });

  it("caps one very long training so the other weeks stay readable", () => {
    const b = trainingBlock([row("2026-11-02", 480, "attended")], null, NOW);
    expect(b.weeks[7].capsules[0].minutes).toBe(240);
    expect(b.thisWeek.went).toBe(480);
  });
});

describe("middleHalf", () => {
  it("is the lower and upper quartile, to five minutes", () => {
    expect(middleHalf([150, 75, 210, 120, 195, 75, 180])).toEqual({ low: 100, high: 190 });
    expect(middleHalf([60, 60, 60, 60])).toEqual({ low: 60, high: 60 });
  });
});

describe("goalView", () => {
  it("invites without asking when there is no goal", () => {
    expect(goalView(null, 75, 0)).toMatchObject({ set: false, met: false, share: 0 });
  });
  it("says what is left and what is booked", () => {
    expect(goalView(150, 75, 120)).toEqual({ set: true, met: false, share: 0.5, note: "75 min to go · 120 min booked. Only you see this." });
    expect(goalView(150, 75, 0).note).toBe("75 min to go. Only you see this.");
  });
  it("is met at the goal and fills the ring, however far past it", () => {
    expect(goalView(60, 60, 0)).toMatchObject({ met: true, share: 1 });
    expect(goalView(60, 200, 0)).toMatchObject({ met: true, share: 1 });
  });
});

describe("shelf", () => {
  const types = [
    { id: "t0", name: "Class", rank: 0 },
    { id: "t1", name: "Workshop", rank: 1 },
    { id: "t3", name: "Talk", rank: 3 },
  ];
  it("shows certificates newest first, then firsts newest first, then the types not tried", () => {
    const rows = [row("2026-09-15", 75, "attended", 0, "t0"), row("2026-09-22", 75, "attended", 0, "t0"), row("2026-10-06", 45, "attended", 3, "t3"), row("2026-10-01", 60, "skipped", 1, "t1")];
    const awards = [
      { key: "ai_officer", label: "AI Officer", awardedAt: "2026-10-15T02:00:00Z" },
      { key: "ai_engineer", label: "AI Engineer", awardedAt: "2026-11-02T02:00:00Z" },
    ];
    expect(shelf(rows, types, awards).map((b) => [b.kind, b.name, "when" in b ? b.when : null])).toEqual([
      ["certificate", "AI Engineer", "2 Nov"],
      ["certificate", "AI Officer", "15 Oct"],
      ["first", "First talk", "6 Oct"],
      ["first", "First class", "15 Sep"],
      ["not-yet", "First workshop", null],
    ]);
  });
  it("never earns a first from a skip or a training still to come", () => {
    const rows = [row("2026-11-05", 60, "pending", 1, "t1"), row("2026-10-01", 60, "skipped", 1, "t1")];
    expect(shelf(rows, types, []).filter((b) => b.kind === "first")).toEqual([]);
  });
});
