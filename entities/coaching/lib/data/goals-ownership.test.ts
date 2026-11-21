import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// A FAST goal belongs to the person, not to a coach's roster. coaching_profiles
// has one row per team member (team_member_id is unique) and `active` says
// whether a coach currently runs their 1-1 rhythm. Every read or write that
// finds "this person's profile" for goals must therefore ignore `active`;
// filtering on it made a member removed from a roster unable to save a goal
// (K.3, B4) and, once that was fixed, unable to see the goal they saved.

// Each read finds the person's profile, and the goal reads then list goals.
const scriptProfile = () => script("coaching_profiles", { data: { id: "p1" } });
const scriptGoals = () => script("goals", { data: [] });

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (t: string) => builderFor(t) } }));
vi.mock("./goals", () => ({
  GOAL_SELECT: "id",
  OCEAN_SELECT: "id",
  PRIORITY_SELECT: "id",
  getEdgesLadderOptions: async () => ({ objectives: [], keyResults: [] }),
  toGoal: (r: unknown) => r,
  toOcean: (r: unknown) => r,
  toPriority: (r: unknown) => r,
  attachComments: (g: unknown) => g,
  getGoalComments: async () => [],
}));

import { getCoachingProfileIdForMember } from "./shared";
import { getTeamMemberActiveGoals } from "./member-goals";
import { getMyGoals } from "./my-goals";
import type { TeamActor } from "@/kernel/identity/team-auth";

const profileFilters = () =>
  calls
    .filter((c) => c.table === "coaching_profiles")
    .flatMap((c) => c.filters.filter((f) => f[1] === "active"));

describe("goal reads find the person's profile regardless of roster state", () => {
  beforeEach(() => resetFake());

  it("getCoachingProfileIdForMember", async () => {
    scriptProfile();
    await getCoachingProfileIdForMember("tm-1");
    expect(profileFilters()).toEqual([]);
  });

  it("getTeamMemberActiveGoals", async () => {
    scriptProfile();
    scriptGoals();
    await getTeamMemberActiveGoals("tm-1");
    expect(profileFilters()).toEqual([]);
  });

  it("getMyGoals", async () => {
    scriptProfile();
    scriptGoals();
    await getMyGoals({ teamMemberId: "tm-1" } as TeamActor);
    expect(profileFilters()).toEqual([]);
  });
});
