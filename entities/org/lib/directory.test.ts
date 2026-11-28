import { beforeEach, describe, expect, it, vi } from "vitest";
import { queries, recordingFrom, resetQueries, type Step } from "./testing/query-recorder";

// The team_directory questions org's door answers (A.67). Each row is the query
// a caller in another entity built by hand before A.67, step for step. The
// portal's three questions are pinned hardest: their column lists are what a
// client may see of the staff placed with it, and none of them carries email.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: recordingFrom } }));

import {
  activeEmployeesInDepartments,
  activeStaff,
  leaveHistoryMembers,
  placedStaff,
  placedStaffLeaveFacts,
  searchStaffDirectory,
  staffIdsNamed,
  staffNames,
  staffPeopleNamed,
} from "./directory";

beforeEach(() => resetQueries());

const NAMES = "display_name, preferred_name, full_name";
const NAMES_AND_EMAIL = "display_name, preferred_name, full_name, email";
const SEARCH_COLUMNS =
  "id, person_id, full_name, email, status, position_title, department_name, manager_name, location, employment_type, start_date";
const CURRENT: Step = ["in", "status", ["active", "on_leave", "notice", "pre_start"]];

const cases: [string, () => Promise<unknown>, Step[]][] = [
  // portal getAssignedTimeOff and the decisions queue (both "id, STAFF_NAME_COLUMNS"); team assistant timeOff (was "id, full_name").
  ["staffNames", () => staffNames(["tm1", "tm2"]), [["select", `id, ${NAMES}`], ["in", "id", ["tm1", "tm2"]]]],
  // portal team roster.
  [
    "placedStaff",
    () => placedStaff(["tm1"]),
    [["select", `id, person_id, ${NAMES}, position_title, location, work_schedule, start_date`], ["in", "id", ["tm1"]]],
  ],
  // portal getAssignedLeaveDirectory.
  [
    "placedStaffLeaveFacts",
    () => placedStaffLeaveFacts(["tm1"]),
    [["select", `id, ${NAMES}, team, location, leave_policy, work_schedule, status`], ["in", "id", ["tm1"]]],
  ],
  // time-off admin history.
  [
    "leaveHistoryMembers",
    () => leaveHistoryMembers(),
    [["select", `id, ${NAMES_AND_EMAIL}, status, team, location, leave_policy, work_schedule, manager_name`], ["order", "full_name", { ascending: true }]],
  ],
  // team assistant staffDirectory, current staff, no narrowing.
  [
    "searchStaffDirectory (current)",
    () => searchStaffDirectory({ includeFormer: false, name: "", department: "" }),
    [["select", SEARCH_COLUMNS], CURRENT, ["order", "full_name"], ["limit", 100]],
  ],
  // team assistant staffDirectory, former staff included, by name and department.
  [
    "searchStaffDirectory (former, narrowed)",
    () => searchStaffDirectory({ includeFormer: true, name: "an_a", department: "Ops" }),
    [["select", SEARCH_COLUMNS], ["ilike", "full_name", "%an\\_a%"], ["ilike", "department_name", "%Ops%"], ["order", "full_name"], ["limit", 100]],
  ],
  // team assistant timeOff, who is called this.
  ["staffIdsNamed", () => staffIdsNamed("Ana"), [["select", "id"], ["ilike", "full_name", "%Ana%"], ["limit", 20]]],
  // A name no pattern can spell matches nobody.
  ["staffIdsNamed (unspellable)", () => staffIdsNamed("a*"), [["select", "id"], ["filter", "full_name", "in", "()"], ["limit", 20]]],
  // team assistant findPhotos.
  ["staffPeopleNamed", () => staffPeopleNamed("Bao"), [["select", "person_id, full_name"], ["ilike", "full_name", "%Bao%"], ["limit", 10]]],
  // team individual summary.
  [
    "activeEmployeesInDepartments",
    () => activeEmployeesInDepartments(["Operations", "EO"]),
    [
      ["select", `person_id, ${NAMES_AND_EMAIL}, department_name, employment_type`],
      ["eq", "status", "active"],
      ["in", "department_name", ["Operations", "EO"]],
      ["neq", "employment_type", "contract"],
    ],
  ],
  // company-os daily check-in roster.
  ["activeStaff", () => activeStaff(), [["select", `id, person_id, ${NAMES_AND_EMAIL}, status, department_name`], ["eq", "status", "active"]]],
];

describe("team_directory questions", () => {
  it.each(cases)("%s makes the query its caller made", async (_name, call, steps) => {
    await call();
    expect(queries).toEqual([{ table: "team_directory", steps }]);
  });
});
