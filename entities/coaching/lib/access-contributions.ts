// What coaching tells the access resolver (ADR 0013): who is a Coach, and whom
// a coach's `team` scope reaches. The kernel may not read coaching_profiles, so
// this entity registers the facts through the composition root (app/access.ts).
//
// Coaching is granted by rows, not by the org chart: a dotted-line coach may be
// nobody's manager, which is why a coach's reach adds their coachees to the
// direct reports the kernel already knows.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import type { AccessContributions } from "@/kernel/identity/access-contributions";
import { isCoach } from "./data/roster";

/** The people.id of everyone on an active coaching profile this team member coaches. */
async function coacheePersonIds(coachTeamMemberId: string): Promise<string[]> {
  // These reads decide what a coach may see, so a failure refuses (A.12).
  const profiles = mustRows(
    await companyOs.from("coaching_profiles").select("team_member_id").eq("coach_id", coachTeamMemberId).eq("active", true),
    "[coaching/access] coaching_profiles (coachees)",
  );
  if (profiles.length === 0) return [];
  const members = mustRows(
    await companyOs.from("team_members").select("person_id").in("id", profiles.map((p) => p.team_member_id)),
    "[coaching/access] team_members (coachees)",
  );
  return members.map((m) => m.person_id);
}

export const accessContributions: AccessContributions = {
  impliers: [
    {
      role: "coach",
      because: "coaches at least one person",
      holds: async (s) => s.teamMemberId !== null && (await isCoach({ teamMemberId: s.teamMemberId })),
    },
  ],
  reach: [{ scope: "team", ids: async (s) => (s.teamMemberId === null ? [] : coacheePersonIds(s.teamMemberId)) }],
};
