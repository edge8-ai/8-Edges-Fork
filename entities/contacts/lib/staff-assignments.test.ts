import { beforeEach, describe, expect, it, vi } from "vitest";
import { queries, recordingFrom, resetQueries, type Step } from "./testing/query-recorder";

// The staff_assignments questions and commands contacts' door answers (A.64).
// Each row is the query a caller in another entity built by hand before A.64.
// These decide who approves a placed member's leave and which client boards
// a team member may open, so "active" (status = 'active') is pinned on every
// question that had it, and its absence on the one that did not.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: recordingFrom } }));

import {
  activeClientCompaniesOf,
  activeClientIdsOf,
  activePlacementAt,
  activeStaffNamesAt,
  activeStaffOfCompanies,
  allPlacementSpans,
  anyActivePlacementOf,
  clientManagerPlacementOf,
  clientManagersOfMembers,
  createStaffAssignment,
  endPlacement,
  existingActivePlacement,
  membersManagedBy,
  setPlacementClientManager,
  setPlacementClientVisible,
  staffAssignment,
} from "./staff-assignments";

beforeEach(() => resetQueries());

const ACTIVE: Step = ["eq", "status", "active"];
const OLDEST_FIRST = { ascending: true };

const reads: [string, () => Promise<unknown>, Step[]][] = [
  // portal time-off: the client manager of each placed member.
  [
    "clientManagersOfMembers",
    () => clientManagersOfMembers(["tm1"], ["c1"]),
    [
      ["select", "team_member_id, client_manager_person_id, created_at"],
      ["in", "team_member_id", ["tm1"]],
      ["in", "company_id", ["c1"]],
      ACTIVE,
      ["not", "client_manager_person_id", "is", null],
      ["order", "created_at", OLDEST_FIRST],
    ],
  ],
  // time-off approver: the member's client manager.
  [
    "clientManagerPlacementOf",
    () => clientManagerPlacementOf("tm1"),
    [
      ["select", "client_manager_person_id, company_id"],
      ["eq", "team_member_id", "tm1"],
      ACTIVE,
      ["not", "client_manager_person_id", "is", null],
      ["order", "created_at", OLDEST_FIRST],
      ["limit", 1],
    ],
  ],
  // time-off approver: the members a client manager decides for.
  [
    "membersManagedBy",
    () => membersManagedBy("p1", ["c1"]),
    [["select", "team_member_id"], ["eq", "client_manager_person_id", "p1"], ACTIVE, ["in", "company_id", ["c1"]]],
  ],
  // crm company hub: the backlog editors' staff names.
  [
    "activeStaffNamesAt",
    () => activeStaffNamesAt("c1"),
    [["select", "team_members!team_member_id(people:people!person_id(display_name, preferred_name, full_name, email))"], ["eq", "company_id", "c1"], ACTIVE],
  ],
  // boards Workboard: client staff join the member list.
  [
    "activeStaffOfCompanies",
    () => activeStaffOfCompanies(["c1"]),
    [["select", "company_id, team_members!team_member_id(person_id)"], ["in", "company_id", ["c1"]], ACTIVE],
  ],
  // team hub: the member's client companies.
  [
    "activeClientCompaniesOf",
    () => activeClientCompaniesOf("tm1"),
    [["select", "role_title, company_id, companies:companies!company_id(id, name, industry)"], ["eq", "team_member_id", "tm1"], ACTIVE],
  ],
  // team assistant access and boards' member board ids.
  ["activeClientIdsOf", () => activeClientIdsOf("tm1"), [["select", "company_id"], ["eq", "team_member_id", "tm1"], ACTIVE]],
  // team hub: whether the member has any client.
  ["anyActivePlacementOf", () => anyActivePlacementOf("tm1"), [["select", "id"], ["eq", "team_member_id", "tm1"], ACTIVE, ["limit", 1]]],
  // boards access: may this member work this client's board.
  [
    "activePlacementAt",
    () => activePlacementAt("c1", "tm1"),
    [["select", "id"], ["eq", "company_id", "c1"], ["eq", "team_member_id", "tm1"], ACTIVE, ["limit", 1], ["maybeSingle"]],
  ],
  // company-os: refuse a second active placement (no limit, so two raise).
  [
    "existingActivePlacement",
    () => existingActivePlacement("c1", "tm1"),
    [["select", "id"], ["eq", "company_id", "c1"], ["eq", "team_member_id", "tm1"], ACTIVE, ["maybeSingle"]],
  ],
  // company-os: the placement an action changes.
  ["staffAssignment", () => staffAssignment("a1"), [["select", "company_id, team_member_id, status"], ["eq", "id", "a1"], ["maybeSingle"]]],
  // finance delivery cost: every placement, ended ones too.
  ["allPlacementSpans", () => allPlacementSpans(20000), [["select", "team_member_id, company_id, start_date, end_date, status"], ["limit", 20000]]],
];

describe("staff_assignments questions (A.64)", () => {
  it.each(reads)("%s asks exactly what its callers asked", async (_name, ask, steps) => {
    await ask();
    expect(queries).toEqual([{ table: "staff_assignments", steps }]);
  });
});

describe("staff_assignments commands (A.64)", () => {
  const cases: [string, () => Promise<unknown>, Step[]][] = [
    [
      "createStaffAssignment",
      () => createStaffAssignment({ companyId: "c1", teamMemberId: "tm1", roleTitle: null, clientVisible: true }),
      [["insert", { company_id: "c1", team_member_id: "tm1", role_title: null, client_visible: true }], ["select", "id"], ["single"]],
    ],
    ["setPlacementClientVisible", () => setPlacementClientVisible("a1", false), [["update", { client_visible: false }], ["eq", "id", "a1"]]],
    ["setPlacementClientManager", () => setPlacementClientManager("a1", null), [["update", { client_manager_person_id: null }], ["eq", "id", "a1"]]],
    ["endPlacement", () => endPlacement("a1", "2026-10-18"), [["update", { status: "ended", end_date: "2026-10-18" }], ["eq", "id", "a1"]]],
  ];
  it.each(cases)("%s writes exactly what the company-os action wrote", async (_name, act, steps) => {
    await act();
    expect(queries).toEqual([{ table: "staff_assignments", steps }]);
  });
});
