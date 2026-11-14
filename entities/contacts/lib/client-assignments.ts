// Which client companies a team member is assigned to, from staff_assignments
// (this entity's table). The team client hub, the weekly status page and the
// access resolver all ask it, so a person's clients are one fact everywhere.
// Moved here from team's client hub with A.88.2 (ADR 0025): team is a surface
// entity and may not reach this door from its lib/.
import { mustRows } from "@/kernel/data/read";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { activeClientCompaniesOf, anyActivePlacementOf } from "./staff-assignments";

export type ClientCompany = { id: string; name: string; roleTitle: string | null; industry?: string | null }; // industry: the Home tile icon (TH.1.7)

// The client companies this team member is actively assigned to. A failed read
// raises, like hasClientAssignments: this list decides which clients a person
// may open, and an empty one would wrongly say "not assigned" (A.12).
export async function getActorClientCompanies(actor: Pick<TeamActor, "teamMemberId">): Promise<ClientCompany[]> {
  const rows = mustRows(
    await activeClientCompaniesOf(actor.teamMemberId),
    "[contacts/assignments] staff_assignments",
  );
  const seen = new Set<string>();
  const out: ClientCompany[] = [];
  for (const r of rows) {
    const c = Array.isArray(r.companies) ? r.companies[0] : r.companies;
    if (!c || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push({ id: c.id, name: c.name, roleTitle: r.role_title, industry: c.industry ?? null });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function hasClientAssignments(actor: Pick<TeamActor, "teamMemberId">): Promise<boolean> {
  // A capability: a failed read must not answer "no" (A.12).
  return mustRows(await anyActivePlacementOf(actor.teamMemberId), "[contacts/assignments] staff_assignments").length > 0;
}
