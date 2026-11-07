import { companyOs } from "@/kernel/data/supabase";
import { one } from "@/kernel/config/embedded";
import { type CoachingGoal, type EdgesOptions, type AdminMemberGoals } from "../types";
import { GOAL_SELECT, getEdgesLadderOptions, toGoal } from "./goals";
import { goalColumns, type MyGoalInput, validateGoal } from "./my-goals";
import { type Result } from "./shared";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

// The member's active coaching profile, created if they have none — the admin
// analogue of getOrCreateMyCoachingProfileId, keyed by team_member_id rather
// than the actor.
async function getOrCreateProfileIdForMember(
  teamMemberId: string,
): Promise<{ ok: true; profileId: string } | { ok: false; error: string }> {
  if (!teamMemberId) return { ok: false, error: "No team member." };
  const { data: existing, error: existingError } = await companyOs
    .from("coaching_profiles")
    .select("id")
    .eq("team_member_id", teamMemberId)
    // Not filtered on `active`: team_member_id is unique, so a profile taken
    // off the roster (active=false) still owns this person's goals. Filtering
    // it out made the insert below hit the unique constraint for anyone ever
    // removed from a coach's roster (K.3, B4).
    .maybeSingle();
  if (existingError) console.error("[team/coaching/admin-goals] coaching_profiles", existingError);
  if (existing) return { ok: true, profileId: (existing as { id: string }).id };

  const { data: me, error: meError } = await companyOs
    .from("team_members")
    .select("manager_id")
    .eq("id", teamMemberId)
    .maybeSingle();
  if (meError) console.error("[team/coaching/admin-goals] team_members", meError);
  const managerId = (me as { manager_id: string | null } | null)?.manager_id ?? null;

  const { data: created, error } = await companyOs
    .from("coaching_profiles")
    .insert({ team_member_id: teamMemberId, coach_id: managerId })
    .select("id")
    .maybeSingle();
  if (error || !created) return { ok: false, error: "Could not start this member's goals. Try again." };
  return { ok: true, profileId: (created as { id: string }).id };
}

// Every active employee with their FAST goals, for the admin editor. Same
// roster shape as the company-goals rollup (employees only), but carrying the
// goal ids and measures the editor needs.
export async function getAdminRosterGoals(): Promise<{ members: AdminMemberGoals[]; edges: EdgesOptions }> {
  const [rosterRes, edges] = await Promise.all([
    companyOs
      .from("team_members")
      .select(
        `id, people:people!person_id(${NAME_COLUMNS}), ` +
          "coaching_profiles:coaching_profiles!team_member_id(id, active)",
      )
      .eq("status", "active")
      .neq("employment_type", "contract"),
    getEdgesLadderOptions(),
  ]);
  if (rosterRes.error) {
    console.error("[team/coaching/admin-goals] team_members", rosterRes.error);
    throw new Error("Could not load the roster.");
  }

  type Name = NamedPerson;
  type Prof = { id: string; active: boolean };
  const roster = (rosterRes.data ?? []) as unknown as Record<string, unknown>[];

  // profile id -> owning member, so goals fetched by profile group back to the
  // right person (a member may hold more than one profile over time).
  const profileToMember = new Map<string, string>();
  const members = roster.map((r) => {
    const person = one(r.people as Name | Name[] | null);
    const name = personName(person, "Unknown");
    const profs = ((): Prof[] => {
      const p = r.coaching_profiles as Prof | Prof[] | null;
      return Array.isArray(p) ? p : p ? [p] : [];
    })();
    for (const p of profs) profileToMember.set(p.id, r.id as string);
    return { teamMemberId: r.id as string, name };
  });

  const profileIds = Array.from(profileToMember.keys());
  const goalsRes = profileIds.length
    ? await companyOs
        .from("goals")
        .select(GOAL_SELECT)
        .in("coaching_profile_id", profileIds)
        .order("created_at")
    : { data: [] as unknown[], error: null };
  if (goalsRes.error) {
    console.error("[team/coaching/admin-goals] goals", goalsRes.error);
    throw new Error("Could not load the goals.");
  }

  const goalsByMember = new Map<string, CoachingGoal[]>();
  for (const row of (goalsRes.data ?? []) as unknown as Record<string, unknown>[]) {
    const memberId = profileToMember.get(row.coaching_profile_id as string);
    if (!memberId) continue;
    goalsByMember.set(memberId, [...(goalsByMember.get(memberId) ?? []), toGoal(row, edges)]);
  }

  return {
    members: members
      .map((m) => ({ ...m, goals: goalsByMember.get(m.teamMemberId) ?? [] }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    edges,
  };
}

export async function adminAddGoal(teamMemberId: string, input: MyGoalInput): Promise<Result> {
  const invalid = validateGoal(input);
  if (invalid) return { ok: false, error: invalid };

  const profile = await getOrCreateProfileIdForMember(teamMemberId);
  if (!profile.ok) return { ok: false, error: profile.error };

  const { error } = await companyOs.from("goals").insert({
    coaching_profile_id: profile.profileId,
    // created_by names the team member whose goal it is, matching a self-add:
    // the admin is the actor, but the goal belongs to the member.
    created_by: teamMemberId,
    ...goalColumns(input),
  });
  return error ? { ok: false, error: "Could not add the goal." } : { ok: true };
}

export async function adminUpdateGoal(goalId: string, input: MyGoalInput): Promise<Result> {
  if (!goalId) return { ok: false, error: "Not found." };
  const invalid = validateGoal(input);
  if (invalid) return { ok: false, error: invalid };

  const { error } = await companyOs
    .from("goals")
    .update({ ...goalColumns(input), updated_at: new Date().toISOString() })
    .eq("id", goalId);
  return error ? { ok: false, error: "Could not save the goal." } : { ok: true };
}

export async function adminDeleteGoal(goalId: string): Promise<Result> {
  if (!goalId) return { ok: false, error: "Not found." };
  const { error } = await companyOs.from("goals").delete().eq("id", goalId);
  return error ? { ok: false, error: "Could not delete the goal." } : { ok: true };
}
