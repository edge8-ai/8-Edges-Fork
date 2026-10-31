import { companyOs } from "@/kernel/data/supabase";

// The questions other entities ask about coaching profiles, held 1-1s and
// personal goals (A.70, ADR 0018). Until A.70 the door handed out the raw
// `selectCoachingProfiles(columns)`, `selectCoachingOneOnOnes(columns)` and
// `selectGoals(columns)` of lib/reads.ts (deleted with A.70, as nothing in
// coaching called them), and org and team each chose their own columns and
// spelled "a held 1-1" (held and not archived) or "an active goal" in their own
// filters. Each question here is the exact query one caller built by hand:
// same columns, filters, order and single-row form.
// entities/coaching/lib/coaching-lookups.test.ts pins each one.
//
// The selects are literal, so PostgREST types the rows.

/** Each of these members' coaching profile id (org's team shelf). */
export function coachingProfilesOfMembers(teamMemberIds: string[]) {
  return companyOs.from("coaching_profiles").select("id, team_member_id").in("team_member_id", teamMemberIds);
}

/** Every coaching profile with the person it belongs to (team's weekly individual summary). */
export function coachingProfilePeople() {
  return companyOs.from("coaching_profiles").select("id, team_members:team_members!team_member_id(person_id)");
}

/**
 * The profile, if any, through which this coach coaches this member: its id
 * or null (team's review observer check, which lets a coach read their
 * coachee's reviews).
 */
export function profileCoachedBy(coachTeamMemberId: string, teamMemberId: string) {
  return companyOs.from("coaching_profiles").select("id").eq("coach_id", coachTeamMemberId).eq("team_member_id", teamMemberId).maybeSingle();
}

/** The held, unarchived 1-1s of these profiles, unordered (org's "Last 1-1" column). */
export function heldOneOnOnesOfProfiles(profileIds: string[]) {
  return companyOs
    .from("coaching_one_on_ones")
    .select("coaching_profile_id, held_on")
    .in("coaching_profile_id", profileIds)
    .eq("status", "held")
    .is("archived_at", null);
}

/** Every held, unarchived 1-1 on or after `sinceDay`, newest first (team's weekly individual summary). */
export function heldOneOnOnesSince(sinceDay: string) {
  return companyOs
    .from("coaching_one_on_ones")
    .select("coaching_profile_id, held_on")
    .eq("status", "held")
    .is("archived_at", null)
    .gte("held_on", sinceDay)
    .order("held_on", { ascending: false });
}

/** Every active personal goal with the objective or key result it serves, in goal order (team's company-goals roll-up). */
export function activeGoalLinks() {
  return companyOs.from("goals").select("coaching_profile_id, title, objective_id, key_result_id").eq("status", "active").order("sort_order");
}
