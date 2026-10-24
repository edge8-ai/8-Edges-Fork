import { describe, expect, it } from "vitest";
import type { KrRow } from "./edges-shared";
import { krProgress, objectiveRollup, yearPacePct } from "./kr-progress";

// G.14. How Company Goals reads a key result and an objective. The figures are
// the 2026 company goals as production held them on 11 Oct 2026.
function kr(over: Partial<KrRow>): KrRow {
  return {
    id: "kr",
    objective_id: "o",
    title: "t",
    target_value: 100,
    current_value: 0,
    unit: null,
    direction: "up",
    delivery_mix: "human",
    accountable_person_id: "p",
    executing_agent: null,
    source: "manual",
    source_detail: null,
    status: "on_track",
    sort_order: 0,
    ...over,
  };
}

describe("krProgress", () => {
  it("shows the value against its target, in the key result's own unit", () => {
    expect(krProgress(kr({ current_value: 12, target_value: 24, unit: "keynotes" }), true)).toMatchObject({
      pct: 50,
      tone: "on",
      value: "12",
      target: "24",
      unit: "keynotes",
    });
    expect(krProgress(kr({ current_value: 100000, target_value: 170000, unit: "usd", status: "off_track" }), true)).toMatchObject({
      pct: 59,
      tone: "off",
      value: "$100k",
      target: "$170k",
      unit: "",
    });
    expect(krProgress(kr({ current_value: 834, target_value: 1000 }), true)).toMatchObject({ value: "834", target: "1,000" });
    expect(krProgress(kr({ current_value: 45, unit: "%" }), true)).toMatchObject({ value: "45%", target: "100%" });
    expect(krProgress(kr({ current_value: 2500, target_value: 75000, unit: "usd" }), true)).toMatchObject({ value: "$2.5k" });
  });

  it("calls a met target a hit, whatever status was last typed", () => {
    expect(krProgress(kr({ current_value: 25, target_value: 25, unit: "%" }), true).tone).toBe("hit");
    expect(krProgress(kr({ current_value: 3, target_value: 10, status: "done" }), true).tone).toBe("hit");
  });

  it("never reads an unmeasured key result as a number", () => {
    // Days to hire at 0 with a target of at most 20: the old bar drew 100% done.
    const p = krProgress(kr({ current_value: 0, target_value: 20, unit: "days", direction: "down" }), false);
    expect(p).toMatchObject({ measured: false, pct: null, tone: "unmeasured" });
  });

  it("keeps a lower-is-better target readable", () => {
    expect(krProgress(kr({ current_value: 26, target_value: 20, unit: "days", direction: "down" }), true)).toMatchObject({
      value: "26d",
      target: "≤ 20d",
      pct: 77,
    });
  });

  it("has no percent when there is no target", () => {
    expect(krProgress(kr({ current_value: 4, target_value: null }), true)).toMatchObject({ pct: null, target: null, tone: "on" });
  });
});

describe("objectiveRollup", () => {
  // Operational Excellence on 11 Oct: two measured, four never measured.
  const o4 = [
    kr({ id: "4.1", current_value: 65, target_value: 88 }),
    kr({ id: "4.2", current_value: 25, target_value: 25, unit: "%" }),
    kr({ id: "4.3", current_value: 0, target_value: 20, unit: "days", direction: "down" }),
    kr({ id: "4.4", current_value: 0, target_value: 95, unit: "%" }),
    kr({ id: "4.5", current_value: 0, target_value: 90, unit: "%" }),
    kr({ id: "4.6", current_value: 0, target_value: 100, unit: "%" }),
  ];
  const unmeasured = new Set(["4.3", "4.4", "4.5", "4.6"]);

  it("averages only the key results that have a number", () => {
    const r = objectiveRollup(o4, unmeasured);
    expect(r.pct).toBe(87);
    expect(r.tone).toBe("on");
    expect(r.counts).toEqual([
      { tone: "hit", n: 1 },
      { tone: "on", n: 1 },
      { tone: "unmeasured", n: 4 },
    ]);
  });

  it("has no percent until something is measured", () => {
    const r = objectiveRollup([kr({ id: "a" })], new Set(["a"]));
    expect(r.pct).toBeNull();
    expect(r.counts).toEqual([{ tone: "unmeasured", n: 1 }]);
  });

  it("is off track when a measured key result is, and ignores an unmeasured one's status", () => {
    expect(objectiveRollup([kr({ id: "a", current_value: 5, status: "off_track" }), kr({ id: "b", current_value: 5 })], new Set()).tone).toBe("off");
    expect(objectiveRollup([kr({ id: "a", status: "off_track" }), kr({ id: "b", current_value: 5 })], new Set(["a"])).tone).toBe("on");
    expect(objectiveRollup([kr({ id: "a", current_value: 5, status: "at_risk" })], new Set()).tone).toBe("risk");
  });
});

describe("yearPacePct", () => {
  it("is the share of the goal year gone", () => {
    expect(yearPacePct(2026, new Date("2026-10-11T00:00:00Z"))).toBe(78);
    expect(yearPacePct(2026, new Date("2026-01-01T00:00:00Z"))).toBe(0);
    expect(yearPacePct(2025, new Date("2026-03-01T00:00:00Z"))).toBe(100);
    expect(yearPacePct(2027, new Date("2026-03-01T00:00:00Z"))).toBe(0);
  });
});
