import { companyOs } from "@/kernel/data/supabase";
import { selectStaffAssignments, selectPersonCompanies } from "./reads";
import { one, type Embedded } from "@/kernel/config/embedded";
import type { AssignmentForCompany, AssignmentForTeamMember, ClientContactOption, CompanyOption, TeamMemberOption } from "./staff-assignments-shared";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

// Reads for company_os.staff_assignments — the client-company -> dedicated-staff
// relation (docs/plans/2026-07-11-client-portal-design.md). Admin surfaces only;
// /portal reads through entities/portal/lib/data.ts instead.

// The vocabulary and row shapes live in the browser-safe half beside this file
// (staff-assignments-shared.ts) so a client component can take them from the
// entity's client door. The row shapes are re-exported because the server
// callers name them from this module; the vocabulary is only read in the browser.
export {
  type AssignmentForCompany,
  type AssignmentForTeamMember,
  type ClientContactOption,
  type CompanyOption,
  type TeamMemberOption,
} from "./staff-assignments-shared";

export async function getAssignmentsForCompany(companyId: string): Promise<AssignmentForCompany[]> {
  const { data, error: companyErr } = await selectStaffAssignments(
      `id, team_member_id, role_title, client_visible, start_date, end_date, status, client_manager_person_id, client_manager:people!client_manager_person_id(${NAME_COLUMNS}), team_members!team_member_id(people:people!person_id(${NAME_COLUMNS}), positions:positions!position_id(title))`,
    )
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (companyErr) console.error("[company-os/staff-assignments] staff_assignments", companyErr);

  return ((data ?? []) as unknown[]).map((row) => {
    const r = row as Record<string, unknown>;
    const tm = one(r.team_members as Embedded<Record<string, unknown>>);
    const person = tm ? one(tm.people as Embedded<NamedPerson>) : null;
    const position = tm ? one(tm.positions as Embedded<{ title: string | null }>) : null;
    const clientManager = one(
      r.client_manager as Embedded<NamedPerson>,
    );
    return {
      id: r.id as string,
      team_member_id: r.team_member_id as string,
      role_title: (r.role_title as string | null) ?? null,
      client_manager_person_id: (r.client_manager_person_id as string | null) ?? null,
      client_manager_name: personName(clientManager, null),
      client_visible: (r.client_visible as boolean | null) ?? true,
      start_date: (r.start_date as string | null) ?? null,
      end_date: (r.end_date as string | null) ?? null,
      status: r.status as string,
      display_name: person?.display_name ?? null,
      preferred_name: person?.preferred_name ?? null,
      full_name: person?.full_name ?? null,
      email: person?.email ?? null,
      position_title: position?.title ?? null,
    };
  });
}

export async function getAssignmentsForTeamMember(teamMemberId: string): Promise<AssignmentForTeamMember[]> {
  const { data, error: memberErr } = await selectStaffAssignments(
      `id, company_id, role_title, client_visible, start_date, end_date, status, client_manager_person_id, companies:companies!company_id(name), client_manager:people!client_manager_person_id(${NAME_COLUMNS})`,
    )
    .eq("team_member_id", teamMemberId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (memberErr) console.error("[company-os/staff-assignments] staff_assignments", memberErr);

  return ((data ?? []) as unknown[]).map((row) => {
    const r = row as Record<string, unknown>;
    const company = one(r.companies as Embedded<{ name: string | null }>);
    const clientManager = one(
      r.client_manager as Embedded<NamedPerson>,
    );
    return {
      id: r.id as string,
      company_id: r.company_id as string,
      company_name: company?.name ?? null,
      role_title: (r.role_title as string | null) ?? null,
      client_manager_person_id: (r.client_manager_person_id as string | null) ?? null,
      client_manager_name: personName(clientManager, null),
      client_visible: (r.client_visible as boolean | null) ?? true,
      start_date: (r.start_date as string | null) ?? null,
      end_date: (r.end_date as string | null) ?? null,
      status: r.status as string,
    };
  });
}

// Companies eligible to receive a staff assignment: active customers only
// (assigning staff to a lead/prospect makes no sense). Small list; the admin
// UI renders it as a plain <select>.
export async function listAssignableCompanies(): Promise<CompanyOption[]> {
  const { data, error: companiesErr } = await companyOs
    .from("companies")
    .select("id, name")
    .is("archived_at", null)
    .eq("lifecycle_stage", "customer")
    .order("name", { ascending: true });
  if (companiesErr) console.error("[company-os/staff-assignments] companies", companiesErr);
  return (data ?? []) as CompanyOption[];
}

export async function listActiveTeamMembers(): Promise<TeamMemberOption[]> {
  const { data, error: teamErr } = await companyOs
    .from("team_members")
    .select(`id, people!person_id(${NAME_COLUMNS})`)
    .eq("status", "active");
  if (teamErr) console.error("[company-os/staff-assignments] team_members", teamErr);
  return ((data ?? []) as { id: string; people: Embedded<NamedPerson> }[])
    .map((t) => ({ id: t.id, name: personName(one(t.people), "Unknown") }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// People at the client, for the "approves leave" picker. Sourced from the CRM
// link (person_companies), not from portal_members: naming someone approver is
// a record of who manages the placement, and does not by itself hand them a
// portal login.
export async function listClientContacts(companyId: string): Promise<ClientContactOption[]> {
  const { data, error: contactsErr } = await selectPersonCompanies(`person_id, people!person_id(${NAME_COLUMNS}, archived_at)`)
    .eq("company_id", companyId);
  if (contactsErr) console.error("[company-os/staff-assignments] person_companies", contactsErr);

  return ((data ?? []) as unknown[])
    .map((row) => {
      const r = row as Record<string, unknown>;
      const p = one(r.people as Embedded<NamedPerson & { email: string; archived_at: string | null }>);
      if (!p || p.archived_at) return null;
      return { id: r.person_id as string, name: personName(p) };
    })
    .filter((o): o is ClientContactOption => o !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}
