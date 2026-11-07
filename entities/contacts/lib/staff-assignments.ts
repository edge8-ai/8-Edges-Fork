import { companyOs } from "@/kernel/data/supabase";
import { selectStaffAssignments, selectPersonCompanies } from "./reads";
import { insertStaffAssignments, updateStaffAssignments } from "./writes";
import { one, type Embedded } from "@/kernel/config/embedded";
import type { AssignmentForCompany, AssignmentForTeamMember, ClientContactOption, CompanyOption, TeamMemberOption } from "./staff-assignments-shared";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

// Reads for company_os.staff_assignments — the client-company -> dedicated-staff
// relation (docs/plans/2026-07-11-client-portal-design.md). The readers just
// below serve the admin surfaces; the questions at the end of the file are the
// ones other entities ask (the portal's leave approvers, the Workboard's
// access, the team hub and assistant, delivery cost), and the commands the
// company-os assignment cards perform.

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

// ---- The questions other entities ask of staff_assignments (A.64) ----------
//
// "Active" is status = 'active': an ended placement keeps its row with status
// 'ended' and an end date. Each question keeps exactly the query its caller
// built by hand before A.64, including where two of them differ only by a
// limit, so neither caller's answer moves.

/** The client manager of each of these members' active placements at these companies, oldest placement first. */
export async function clientManagersOfMembers(teamMemberIds: string[], companyIds: string[]) {
  return companyOs
    .from("staff_assignments")
    .select("team_member_id, client_manager_person_id, created_at")
    .in("team_member_id", teamMemberIds)
    .in("company_id", companyIds)
    .eq("status", "active")
    .not("client_manager_person_id", "is", null)
    .order("created_at", { ascending: true });
}

/** A member's oldest active placement that names a client manager, as a list of at most one. */
export async function clientManagerPlacementOf(teamMemberId: string) {
  return companyOs
    .from("staff_assignments")
    .select("client_manager_person_id, company_id")
    .eq("team_member_id", teamMemberId)
    .eq("status", "active")
    .not("client_manager_person_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(1);
}

/** The members whose active placement at one of these companies names this person as client manager. */
export async function membersManagedBy(personId: string, companyIds: string[]) {
  return companyOs
    .from("staff_assignments")
    .select("team_member_id")
    .eq("client_manager_person_id", personId)
    .eq("status", "active")
    .in("company_id", companyIds);
}

/** The names of the staff actively placed at a company. */
export async function activeStaffNamesAt(companyId: string) {
  return companyOs
    .from("staff_assignments")
    .select("team_members!team_member_id(people:people!person_id(display_name, preferred_name, full_name, email))")
    .eq("company_id", companyId)
    .eq("status", "active");
}

/** The person behind each active placement at these companies: the Workboard's client-staff members. */
export async function activeStaffOfCompanies(companyIds: string[]) {
  return companyOs.from("staff_assignments").select("company_id, team_members!team_member_id(person_id)").in("company_id", companyIds).eq("status", "active");
}

/** A member's active placements with the role title and the client company. */
export async function activeClientCompaniesOf(teamMemberId: string) {
  return companyOs
    .from("staff_assignments")
    .select("role_title, company_id, companies:companies!company_id(id, name, industry)")
    .eq("team_member_id", teamMemberId)
    .eq("status", "active");
}

/** The client company of each of a member's active placements. */
export async function activeClientIdsOf(teamMemberId: string) {
  return companyOs.from("staff_assignments").select("company_id").eq("team_member_id", teamMemberId).eq("status", "active");
}

/** Whether a member has any active placement: at most one id. */
export async function anyActivePlacementOf(teamMemberId: string) {
  return companyOs.from("staff_assignments").select("id").eq("team_member_id", teamMemberId).eq("status", "active").limit(1);
}

/** A member's active placement at a company, the first if there were several. */
export async function activePlacementAt(companyId: string, teamMemberId: string) {
  return companyOs
    .from("staff_assignments")
    .select("id")
    .eq("company_id", companyId)
    .eq("team_member_id", teamMemberId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
}

/** A member's active placement at a company, before placing them again. More than one raises, as maybeSingle does. */
export async function existingActivePlacement(companyId: string, teamMemberId: string) {
  return companyOs
    .from("staff_assignments")
    .select("id")
    .eq("company_id", companyId)
    .eq("team_member_id", teamMemberId)
    .eq("status", "active")
    .maybeSingle();
}

/** One placement's company, member and status, by id. */
export async function staffAssignment(id: string) {
  return companyOs.from("staff_assignments").select("company_id, team_member_id, status").eq("id", id).maybeSingle();
}

/** Every placement, ended ones too, with its member, company, dates and status, at most `limit`: delivery cost. */
export async function allPlacementSpans(limit: number) {
  return companyOs.from("staff_assignments").select("team_member_id, company_id, start_date, end_date, status").limit(limit);
}

export type NewStaffAssignment = { companyId: string; teamMemberId: string; roleTitle: string | null; clientVisible: boolean };

/** Place a member at a client company; answers the new row's id. */
export async function createStaffAssignment(input: NewStaffAssignment) {
  return insertStaffAssignments({
    company_id: input.companyId,
    team_member_id: input.teamMemberId,
    role_title: input.roleTitle,
    client_visible: input.clientVisible,
  })
    .select("id")
    .single();
}

/** Show or hide a placement on the client's team panel. */
export async function setPlacementClientVisible(id: string, clientVisible: boolean) {
  return updateStaffAssignments({ client_visible: clientVisible }).eq("id", id);
}

/** Name the person at the client who approves this placement's leave, or nobody. */
export async function setPlacementClientManager(id: string, clientManagerPersonId: string | null) {
  return updateStaffAssignments({ client_manager_person_id: clientManagerPersonId }).eq("id", id);
}

/** End a placement on a date: its row stays, with status 'ended'. */
export async function endPlacement(id: string, endDate: string) {
  return updateStaffAssignments({ status: "ended", end_date: endDate }).eq("id", id);
}
