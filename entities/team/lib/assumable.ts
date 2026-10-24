// Who a Super Admin may view the Team pages as, and the session they have
// open, for Settings → Assume (docs/plans/2026-10-10-contractor-portal.md,
// PR 2). Contractors come first: checking what a contractor sees is the job
// this was built for. A failed read raises, so the list never quietly omits
// someone.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { NAME_COLUMNS, personName } from "@/kernel/config/people-name";
import { EMPLOYMENT_TYPE_LABEL, type EmploymentType } from "@/kernel/identity/employment-types";
import { PORTAL_STATUSES } from "@/kernel/identity/team-statuses";

export type AssumableTeamMember = { personId: string; name: string; kind: string; contractor: boolean };

type Row = {
  person_id: string;
  employment_type: string | null;
  people: { id: string; display_name: string | null; full_name: string | null; preferred_name: string | null; email: string; auth_user_id: string | null } | null;
};

export async function listAssumableTeamMembers(): Promise<AssumableTeamMember[]> {
  const rows = mustRows(
    await companyOs
      .from("team_members")
      .select(`person_id, employment_type, people!team_members_person_id_fkey(${NAME_COLUMNS}, auth_user_id)`)
      .in("status", PORTAL_STATUSES),
    "[team/assumable] team_members",
  ) as unknown as Row[];
  const seen = new Set<string>();
  const out: AssumableTeamMember[] = [];
  for (const r of rows) {
    // Only someone with a login has a Team view to look at.
    if (!r.people?.auth_user_id || seen.has(r.person_id)) continue;
    seen.add(r.person_id);
    out.push({
      personId: r.person_id,
      name: personName(r.people, "Team member"),
      kind: EMPLOYMENT_TYPE_LABEL[r.employment_type as EmploymentType] ?? "Team member",
      contractor: r.employment_type === "contract",
    });
  }
  return out.sort((a, b) => Number(b.contractor) - Number(a.contractor) || a.name.localeCompare(b.name));
}

/** The open team session this admin started, if any: whom they are viewing and until when. */
export async function openTeamAssume(adminEmail: string): Promise<{ name: string; expiresAt: string } | null> {
  const rows = mustRows(
    await companyOs
      .from("portal_assume_sessions")
      .select(`expires_at, people!portal_assume_sessions_person_id_fkey(${NAME_COLUMNS})`)
      .eq("surface", "team")
      .eq("started_by", adminEmail)
      .is("ended_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("started_at", { ascending: false })
      .limit(1),
    "[team/assumable] portal_assume_sessions",
  ) as unknown as { expires_at: string; people: Row["people"] }[];
  const open = rows[0];
  return open ? { name: personName(open.people, "Team member"), expiresAt: open.expires_at } : null;
}
