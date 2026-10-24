import { beforeEach, describe, expect, it, vi } from "vitest";
import { queries, recordingFrom, resetQueries, type Step } from "./testing/query-recorder";

// The ai_programs questions and commands client-programs' door answers (A.66).
// Each row is the query a caller in another entity built by hand before A.66,
// step for step. Where two callers asked the same question with different
// columns, the question selects their union and the comment names both.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: recordingFrom } }));

import {
  anyProgramOfCompany,
  changeProgramStatus,
  discardProgram,
  everyProgramByName,
  everyProgramOfCompanies,
  hubPrograms,
  liveProgramCompanies,
  liveProgramNamed,
  liveProgramNamesPage,
  liveProgramsOfCompanies,
  openProgram,
  programNames,
  programOwner,
  programPickerOptions,
} from "./programs";

beforeEach(() => resetQueries());

const NEWEST = { ascending: false };
const OLDEST = { ascending: true };
const LIVE: Step = ["neq", "status", "archived"];

const cases: [string, () => Promise<unknown>, Step[]][] = [
  // boards updateBoardSettings: "id, company_id" for the match, "company_id" for the keep check.
  ["programOwner", () => programOwner("p1"), [["select", "id, company_id"], ["eq", "id", "p1"], ["maybeSingle"]]],
  // boards listBoardManageOptions.
  ["everyProgramByName", () => everyProgramByName(), [["select", "id, name, company_id"], ["order", "name"]]],
  // boards getWorkboard's board labels.
  ["programNames", () => programNames(["p1", "p2"]), [["select", "id, name"], ["in", "id", ["p1", "p2"]]]],
  // crm program page, team meetings page, team program page.
  ["programPickerOptions", () => programPickerOptions("c1"), [["select", "id, name"], ["eq", "company_id", "c1"], ["order", "created_at", NEWEST]]],
  // crm company page and team fetchProgramSummaryInputs (team's PROGRAM_SELECT).
  ["hubPrograms", () => hubPrograms("c1"), [["select", "id, name, status"], ["eq", "company_id", "c1"], LIVE, ["order", "created_at", NEWEST]]],
  // team companyHasPrograms and getHubTabFlags.
  ["anyProgramOfCompany", () => anyProgramOfCompany("c1"), [["select", "id"], ["eq", "company_id", "c1"], ["limit", 1]]],
  // htt applyRegistration.
  [
    "liveProgramNamed",
    () => liveProgramNamed("c1", "AIO Labz"),
    [["select", "id"], ["eq", "company_id", "c1"], ["eq", "name", "AIO Labz"], LIVE, ["order", "created_at", OLDEST], ["limit", 1]],
  ],
  // portal listProgramsForActor, and listProgramNamesForActor (which selected "id, name").
  [
    "liveProgramsOfCompanies",
    () => liveProgramsOfCompanies(["c1", "c2"]),
    [["select", "id, company_id, name, status, created_at"], ["in", "company_id", ["c1", "c2"]], LIVE, ["order", "created_at", NEWEST]],
  ],
  // portal hub-tokens livePrograms, one page.
  [
    "liveProgramNamesPage",
    () => liveProgramNamesPage(["c1"], 0, 999),
    [["select", "id, name"], ["in", "company_id", ["c1"]], LIVE, ["order", "id"], ["range", 0, 999]],
  ],
  // portal countActiveProgramsByCompany.
  ["liveProgramCompanies", () => liveProgramCompanies(), [["select", "company_id"], LIVE]],
  // team getClientDigests.
  [
    "everyProgramOfCompanies",
    () => everyProgramOfCompanies(["c1"]),
    [["select", "id, company_id, name, status"], ["in", "company_id", ["c1"]], ["order", "created_at", OLDEST]],
  ],
  // htt applyRegistration and portal createProgramWithPlan.
  [
    "openProgram",
    () => openProgram({ companyId: "c1", name: "Shop", createdBy: "htt-registration" }),
    [["insert", { company_id: "c1", name: "Shop", status: "active", created_by: "htt-registration" }], ["select", "id"], ["single"]],
  ],
  // portal createProgramWithPlan, when the plan row fails.
  ["discardProgram", () => discardProgram("p1"), [["delete"], ["eq", "id", "p1"]]],
  // crm setProgramStatus.
  ["changeProgramStatus", () => changeProgramStatus("c1", "p1", "complete"), [["update", { status: "complete" }], ["eq", "id", "p1"], ["eq", "company_id", "c1"]]],
];

describe("ai_programs questions and commands", () => {
  it.each(cases)("%s makes the query its caller made", async (_name, call, steps) => {
    await call();
    expect(queries).toEqual([{ table: "ai_programs", steps }]);
  });
});
