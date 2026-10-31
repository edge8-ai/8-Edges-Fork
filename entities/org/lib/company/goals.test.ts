import { beforeEach, describe, expect, it, vi } from "vitest";
import { queries, recordingFrom, resetQueries, type Step } from "../testing/query-recorder";

// The objectives, key results and strategy questions org's door answers (A.67).
// Each row is the query a caller in another entity built by hand before A.67,
// step for step.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: recordingFrom } }));

import { KR_SELECT, OBJECTIVE_SELECT } from "./edges-shared";
import {
  everyKeyResult,
  keyResultDeliveryMixes,
  keyResultReadings,
  keyResultSummaries,
  keyResultTitles,
  ladderKeyResult,
  ladderKeyResultOptions,
  ladderObjective,
  ladderObjectiveOptions,
  objectivesOfYear,
} from "./goals";
import { latestStrategy } from "./strategy-read";

beforeEach(() => resetQueries());

const IN_ORDER: Step[] = [["order", "sort_order"], ["order", "id"]];

const cases: [string, () => Promise<unknown>, string, Step[]][] = [
  // team getCompanyGoals.
  [
    "objectivesOfYear",
    () => objectivesOfYear(2026),
    "objectives",
    [["select", OBJECTIVE_SELECT], ["eq", "year", 2026], ["neq", "status", "dropped"], ...IN_ORDER],
  ],
  ["everyKeyResult", () => everyKeyResult(), "key_results", [["select", KR_SELECT], ...IN_ORDER]],
  // coaching getEdgesOptions.
  [
    "ladderObjectiveOptions",
    () => ladderObjectiveOptions(),
    "objectives",
    [["select", "id, title, level, year, status, sort_order"], ...IN_ORDER],
  ],
  ["ladderKeyResultOptions", () => ladderKeyResultOptions(), "key_results", [["select", "id, title, objective_id, sort_order"], ...IN_ORDER]],
  // coaching member ladder.
  ["ladderObjective", () => ladderObjective("o1"), "objectives", [["select", "id, title, quarter, level"], ["eq", "id", "o1"], ["maybeSingle"]]],
  [
    "ladderKeyResult",
    () => ladderKeyResult("k1"),
    "key_results",
    [["select", "id, title, objective_id, unit, current_value, target_value, direction"], ["eq", "id", "k1"], ["maybeSingle"]],
  ],
  // coaching goal alignment.
  [
    "keyResultReadings",
    () => keyResultReadings(["k1", "k2"]),
    "key_results",
    [["select", "id, unit, current_value, target_value, direction"], ["in", "id", ["k1", "k2"]]],
  ],
  // team assistant getMyGoals.
  [
    "keyResultSummaries",
    () => keyResultSummaries(["k1"]),
    "key_results",
    [["select", "id, title, current_value, target_value, unit, status"], ["in", "id", ["k1"]]],
  ],
  // ideas issues board.
  ["keyResultTitles", () => keyResultTitles(), "key_results", [["select", "id, title"]]],
  // company-os admin home and ideas innovation cockpit.
  ["keyResultDeliveryMixes", () => keyResultDeliveryMixes(), "key_results", [["select", "delivery_mix"]]],
  // team /team/strategy.
  ["latestStrategy", () => latestStrategy(), "strategies", [["select", "id, year, title, body_md"], ["order", "year", { ascending: false }], ["limit", 1]]],
];

describe("company goals questions", () => {
  it.each(cases)("%s makes the query its caller made", async (_name, call, table, steps) => {
    await call();
    expect(queries).toEqual([{ table, steps }]);
  });
});
