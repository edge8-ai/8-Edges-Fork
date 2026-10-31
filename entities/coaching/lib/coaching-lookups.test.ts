import { beforeEach, describe, expect, it, vi } from "vitest";
import { queries, recordingFrom, resetQueries, type Step } from "./testing/query-recorder";

// The coaching-profile, 1-1 and goal questions coaching's door answers (A.70).
// Each row is the query a caller in another entity built by hand before A.70
// through selectCoachingProfiles, selectCoachingOneOnOnes or selectGoals, step
// for step.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: recordingFrom } }));

import {
  activeGoalLinks,
  coachingProfilePeople,
  coachingProfilesOfMembers,
  heldOneOnOnesOfProfiles,
  heldOneOnOnesSince,
  profileCoachedBy,
} from "./coaching-lookups";

beforeEach(() => resetQueries());

const HELD: Step[] = [
  ["eq", "status", "held"],
  ["is", "archived_at", null],
];

const cases: [string, () => PromiseLike<unknown>, string, Step[]][] = [
  // org team shelf.
  [
    "coachingProfilesOfMembers",
    () => coachingProfilesOfMembers(["tm1", "tm2"]),
    "coaching_profiles",
    [["select", "id, team_member_id"], ["in", "team_member_id", ["tm1", "tm2"]]],
  ],
  // team individual summary.
  ["coachingProfilePeople", () => coachingProfilePeople(), "coaching_profiles", [["select", "id, team_members:team_members!team_member_id(person_id)"]]],
  // team reviews canObserveReview: the coach's own profile for this member, nothing wider.
  [
    "profileCoachedBy",
    () => profileCoachedBy("coach-1", "tm1"),
    "coaching_profiles",
    [["select", "id"], ["eq", "coach_id", "coach-1"], ["eq", "team_member_id", "tm1"], ["maybeSingle"]],
  ],
  // org team shelf's "Last 1-1".
  [
    "heldOneOnOnesOfProfiles",
    () => heldOneOnOnesOfProfiles(["cp1"]),
    "coaching_one_on_ones",
    [["select", "coaching_profile_id, held_on"], ["in", "coaching_profile_id", ["cp1"]], ...HELD],
  ],
  // team individual summary.
  [
    "heldOneOnOnesSince",
    () => heldOneOnOnesSince("2026-10-12"),
    "coaching_one_on_ones",
    [["select", "coaching_profile_id, held_on"], ...HELD, ["gte", "held_on", "2026-10-12"], ["order", "held_on", { ascending: false }]],
  ],
  // team company goals.
  [
    "activeGoalLinks",
    () => activeGoalLinks(),
    "goals",
    [["select", "coaching_profile_id, title, objective_id, key_result_id"], ["eq", "status", "active"], ["order", "sort_order"]],
  ],
];

describe("coaching questions", () => {
  it.each(cases)("%s makes the query its caller made", async (_name, call, table, steps) => {
    await call();
    expect(queries).toEqual([{ table, steps }]);
  });
});
