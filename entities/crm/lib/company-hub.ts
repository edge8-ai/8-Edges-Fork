// Company-scoped (not actor-scoped) loaders for the Client Hub embedded on the
// admin company 360. Authorization is the admin gate on the page (requireAdmin
// via the layout); these take a companyId directly and never widen scope.

import { companyOs } from "@/kernel/data/supabase";
import { NAME_COLUMNS, type NamedPerson, UNNAMED, personName } from "@/kernel/config/people-name";
import { selectStaffAssignments } from "@/entities/contacts";
import { selectPersonCompanies } from "@/entities/contacts";
import { getAssignmentsForCompany } from "@/entities/contacts";
import type { HubTeam } from "@/entities/contacts";

// Both sides of the account for the Team tab (companyId-scoped mirror of
// getClientTeamForActor).
export async function getCompanyHubTeam(companyId: string): Promise<HubTeam> {
  const [assignments, { data: peopleRows }] = await Promise.all([
    getAssignmentsForCompany(companyId),
    selectPersonCompanies(`role, is_primary, people:people!person_id(${NAME_COLUMNS})`)
      .eq("company_id", companyId),
  ]);

  const edge8 = assignments
    .filter((a) => a.client_visible)
    .map((a) => ({ name: personName(a, "Edge8"), roleTitle: a.role_title || a.position_title, email: a.email }));

  const rows = (peopleRows ?? []) as Array<{
    role: string | null;
    is_primary: boolean | null;
    people: NamedPerson | NamedPerson[] | null;
  }>;
  const client = rows
    .map((r) => {
      const p = Array.isArray(r.people) ? r.people[0] : r.people;
      return { name: personName(p, "Unknown"), title: r.role, email: p?.email ?? null, isPrimary: !!r.is_primary };
    })
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name))
    .map(({ name, title, email }) => ({ name, title, email }));

  return { edge8, client };
}

// The names a roadmap item can be assigned to: Edge8 people with an active
// staff assignment to the company, as they are shown across the OS (display
// name first). client_backlog_items.who stays free text so every reader keeps
// working; the editors offer this list instead of a blank box (Dave, 2026-09-07).
export async function listAssignableStaff(companyId: string): Promise<string[]> {
  const { data, error } = await selectStaffAssignments(`team_members!team_member_id(people:people!person_id(${NAME_COLUMNS}))`)
    .eq("company_id", companyId)
    .eq("status", "active");
  if (error) {
    console.error("[company-os/company-hub] staff_assignments", error);
    return [];
  }
  type Person = NamedPerson;
  const names = new Set<string>();
  for (const row of (data ?? []) as unknown[]) {
    const tm = (row as { team_members: { people: Person | Person[] | null } | { people: Person | Person[] | null }[] | null }).team_members;
    const t = Array.isArray(tm) ? tm[0] : tm;
    const p = t ? (Array.isArray(t.people) ? t.people[0] : t.people) : null;
    // A person with no name and no email is not something anyone can pick, so
    // they are left off the list rather than offered as the placeholder.
    const name = p ? personName(p) : UNNAMED;
    if (name !== UNNAMED) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
