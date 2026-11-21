import { beforeEach, describe, expect, it, vi } from "vitest";
import { queries, recordingFrom, resetQueries, type Step } from "./testing/query-recorder";

// The leave questions time-off's door answers (A.70). Each row is the query a
// caller in another entity built by hand before A.70 through selectTimeOff or
// insertTimeOff, step for step. time_off is personal data, so every question
// keeps its one caller's own column list: none is a union.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: recordingFrom } }));

import {
  approvedLeaveNotEndedBy,
  approvedLeaveWithNamesSince,
  awaySpansOfMember,
  awaySpansOfMembers,
  clientVisibleLeaveOf,
  colleagueLeaveBetween,
  countApprovedLeaveStartingSince,
  countPendingLeave,
  leaveCovering,
  leaveDatesWithMemberEmail,
  leaveRequest,
  memberLeaveHistory,
  ownLeaveBetween,
  pendingLeaveOf,
} from "./leave-lookups";
import { fileLeaveRow } from "./leave-filing";
import { LEAVE_ROW_COLUMNS } from "./leave-transition";

beforeEach(() => resetQueries());

const ASC = { ascending: true };
const DESC = { ascending: false };
const COUNT = { count: "exact", head: true };

const cases: [string, () => PromiseLike<unknown>, Step[]][] = [
  // portal getAssignedTimeOff: the client's calendar, never the reason.
  [
    "clientVisibleLeaveOf",
    () => clientVisibleLeaveOf(["tm1", "tm2"]),
    [
      ["select", "id, team_member_id, leave_type, status, start_date, end_date, is_half_day"],
      ["in", "team_member_id", ["tm1", "tm2"]],
      ["in", "status", ["requested", "approved", "taken"]],
      ["order", "start_date", ASC],
    ],
  ],
  // portal getLeaveDecisionQueue.
  [
    "pendingLeaveOf",
    () => pendingLeaveOf(["tm1"]),
    [
      ["select", "id, team_member_id, leave_type, status, start_date, end_date, is_half_day, reason, created_at"],
      ["in", "team_member_id", ["tm1"]],
      ["eq", "status", "requested"],
      ["order", "start_date", ASC],
    ],
  ],
  // portal decideAssignedTimeOff: `id, ${LEAVE_ROW_COLUMNS}`.
  ["leaveRequest", () => leaveRequest("r1"), [["select", `id, ${LEAVE_ROW_COLUMNS}`], ["eq", "id", "r1"], ["maybeSingle"]]],
  // portal notifyMember.
  [
    "leaveDatesWithMemberEmail",
    () => leaveDatesWithMemberEmail("r1"),
    [["select", "start_date, end_date, team_members!team_member_id(people!person_id(email))"], ["eq", "id", "r1"], ["maybeSingle"]],
  ],
  // org's team-member page.
  [
    "memberLeaveHistory",
    () => memberLeaveHistory("tm1"),
    [
      ["select", "id, leave_type, status, start_date, end_date, is_half_day, days, reason"],
      ["eq", "team_member_id", "tm1"],
      ["order", "start_date", DESC],
      ["limit", 100],
    ],
  ],
  // team assistant myTimeOff, with an upper bound.
  [
    "ownLeaveBetween",
    () => ownLeaveBetween("tm1", "2025-10-26", "2026-12-31"),
    [
      ["select", "team_member_id, leave_type, status, start_date, end_date, days, hours, is_half_day, reason, manager_note, requested_at, approved_at"],
      ["eq", "team_member_id", "tm1"],
      ["gte", "end_date", "2025-10-26"],
      ["lte", "start_date", "2026-12-31"],
      ["order", "start_date", DESC],
      ["limit", 100],
    ],
  ],
  // ... and without one.
  [
    "ownLeaveBetween, open-ended",
    () => ownLeaveBetween("tm1", "2025-10-26", null),
    [
      ["select", "team_member_id, leave_type, status, start_date, end_date, days, hours, is_half_day, reason, manager_note, requested_at, approved_at"],
      ["eq", "team_member_id", "tm1"],
      ["gte", "end_date", "2025-10-26"],
      ["order", "start_date", DESC],
      ["limit", 100],
    ],
  ],
  // team assistant listTimeOff: no reason, no manager note; everyone's ...
  [
    "colleagueLeaveBetween",
    () => colleagueLeaveBetween("2026-10-01", "2026-10-31", null),
    [
      ["select", "team_member_id, leave_type, status, start_date, end_date, days, is_half_day"],
      ["lte", "start_date", "2026-10-31"],
      ["gte", "end_date", "2026-10-01"],
      ["order", "start_date"],
      ["limit", 200],
    ],
  ],
  // ... or the named people's.
  [
    "colleagueLeaveBetween, named",
    () => colleagueLeaveBetween("2026-10-01", "2026-10-31", ["tm1"]),
    [
      ["select", "team_member_id, leave_type, status, start_date, end_date, days, is_half_day"],
      ["lte", "start_date", "2026-10-31"],
      ["gte", "end_date", "2026-10-01"],
      ["in", "team_member_id", ["tm1"]],
      ["order", "start_date"],
      ["limit", 200],
    ],
  ],
  // company-os daily check-in markTimeOff.
  [
    "leaveCovering",
    () => leaveCovering(["tm1"], "2026-10-26"),
    [
      ["select", "team_member_id, leave_type, start_date, end_date, status"],
      ["in", "team_member_id", ["tm1"]],
      ["in", "status", ["approved", "taken"]],
      ["lte", "start_date", "2026-10-26"],
      ["gte", "end_date", "2026-10-26"],
    ],
  ],
  // company-os operations cockpit.
  [
    "approvedLeaveWithNamesSince",
    () => approvedLeaveWithNamesSince("2026-01-01"),
    [
      ["select", "start_date, end_date, leave_type, team_members!team_member_id(people!person_id(display_name, preferred_name, full_name, email))"],
      ["eq", "status", "approved"],
      ["gte", "end_date", "2026-01-01"],
      ["order", "start_date"],
    ],
  ],
  ["countPendingLeave", () => countPendingLeave(), [["select", "id", COUNT], ["eq", "status", "requested"]]],
  // company-os admin dashboard.
  [
    "countApprovedLeaveStartingSince",
    () => countApprovedLeaveStartingSince("2026-09-26"),
    [["select", "id", COUNT], ["eq", "status", "approved"], ["gte", "start_date", "2026-09-26"]],
  ],
  // coaching getLeaveSpans.
  [
    "awaySpansOfMember",
    () => awaySpansOfMember("tm1", "2026-09-01", "2026-11-30"),
    [
      ["select", "start_date, end_date, status, team_member_id"],
      ["eq", "team_member_id", "tm1"],
      ["in", "status", ["approved", "client_approved"]],
      ["lte", "start_date", "2026-11-30"],
      ["gte", "end_date", "2026-09-01"],
    ],
  ],
  // coaching getLeaveSpansByMember.
  [
    "awaySpansOfMembers",
    () => awaySpansOfMembers(["tm1", "tm2"], "2026-09-01", "2026-11-30"),
    [
      ["select", "start_date, end_date, status, team_member_id"],
      ["in", "team_member_id", ["tm1", "tm2"]],
      ["in", "status", ["approved", "client_approved"]],
      ["lte", "start_date", "2026-11-30"],
      ["gte", "end_date", "2026-09-01"],
    ],
  ],
  // coaching backstops, leave.approved.
  [
    "approvedLeaveNotEndedBy",
    () => approvedLeaveNotEndedBy("2026-10-26"),
    [["select", "id, team_member_id, start_date, end_date, leave_type"], ["eq", "status", "approved"], ["gte", "end_date", "2026-10-26"]],
  ],
];

describe("leave questions", () => {
  it.each(cases)("%s makes the query its caller made", async (_name, call, steps) => {
    await call();
    expect(queries).toEqual([{ table: "time_off", steps }]);
  });
});

describe("fileLeaveRow", () => {
  it("inserts the row it is given and selects only the new id, as team's own-service insert did", async () => {
    const row = { team_member_id: "tm1", start_date: "2026-11-02", end_date: "2026-11-03", leave_type: "annual", status: "requested" };
    await fileLeaveRow(row);
    expect(queries).toEqual([{ table: "time_off", steps: [["insert", row], ["select", "id"], ["maybeSingle"]] }]);
  });
});
