// The questions other entities ask of the staff directory (team_directory), A.67.
// Until A.67 the door handed out `selectTeamDirectory`, and portal,
// time-off, team and company-os each chose their own columns and spelled their
// own "active" and "employee" filters. Each question here names what it answers
// and keeps the columns, the filters and the order inside the entity that owns
// the view.
//
// Several of these feed the client portal, where the column list is the privacy
// line: a client sees names and work facts of the staff placed with it, never an
// email. Those questions select exactly the columns the portal read before, and
// no wider, even where an admin question over the same rows reads more.
import { NAME_COLUMNS, NAME_ONLY_COLUMNS, type NamedPerson } from "@/kernel/config/people-name";
import { ilikeLiteral } from "@/kernel/data/postgrest-filter";
import { PORTAL_STATUSES } from "@/kernel/identity/team-statuses";
import { selectTeamDirectory } from "./reads";

/** A name typed into a staff search matches anywhere in the column, literally (no typed wildcards). */
const containing = (escaped: string) => `%${escaped}%`;

export type StaffName = NamedPerson & { id: string };

/**
 * The names of these team members, and nothing else: who is on leave in the
 * portal's calendar and queue, and who the team assistant's leave answer names.
 * No email, because the portal shows these to a client.
 */
export async function staffNames(memberIds: string[]) {
  const { data, error } = await selectTeamDirectory(`id, ${NAME_ONLY_COLUMNS}`).in("id", memberIds);
  return { data: data as StaffName[] | null, error };
}

export type PlacedStaff = StaffName & {
  person_id: string | null;
  position_title: string | null;
  location: string | null;
  work_schedule: string | null;
  start_date: string | null;
};

/** The work facts of the staff placed with a client: the portal's Team tab. No email or contact details. */
export async function placedStaff(memberIds: string[]) {
  const { data, error } = await selectTeamDirectory(
    `id, person_id, ${NAME_ONLY_COLUMNS}, position_title, location, work_schedule, start_date`,
  ).in("id", memberIds);
  return { data: data as PlacedStaff[] | null, error };
}

export type PlacedStaffLeaveFacts = StaffName & {
  team: string | null;
  location: string | null;
  leave_policy: string | null;
  work_schedule: string | null;
  status: string | null;
};

/** The leave facts of the staff placed with a client: the portal's leave directory. No email. */
export async function placedStaffLeaveFacts(memberIds: string[]) {
  const { data, error } = await selectTeamDirectory(
    `id, ${NAME_ONLY_COLUMNS}, team, location, leave_policy, work_schedule, status`,
  ).in("id", memberIds);
  return { data: data as PlacedStaffLeaveFacts[] | null, error };
}

export type LeaveHistoryMember = {
  id: string;
  full_name: string | null;
  display_name: string | null;
  preferred_name: string | null;
  email: string;
  status: string | null;
  team: string | null;
  location: string | null;
  leave_policy: string | null;
  work_schedule: string | null;
  manager_name: string | null;
};

/** Every member of the directory, former ones included, by full name: the admin leave history. */
export async function leaveHistoryMembers() {
  const { data, error } = await selectTeamDirectory(
    `id, ${NAME_COLUMNS}, status, team, location, leave_policy, work_schedule, manager_name`,
  ).order("full_name", { ascending: true });
  return { data: data as LeaveHistoryMember[] | null, error };
}

export type StaffDirectoryEntry = {
  id: string;
  person_id: string;
  full_name: string | null;
  email: string | null;
  status: string;
  position_title: string | null;
  department_name: string | null;
  manager_name: string | null;
  location: string | null;
  employment_type: string | null;
  start_date: string | null;
};

/**
 * The team assistant's staff directory search, at most 100 by full name. Current
 * staff only (the portal statuses) unless former staff are asked for; a name or
 * a department narrows it to rows containing that text.
 */
export async function searchStaffDirectory(search: { includeFormer: boolean; name?: string; department?: string }) {
  let q = selectTeamDirectory(
    "id, person_id, full_name, email, status, position_title, department_name, manager_name, location, employment_type, start_date",
  );
  if (!search.includeFormer) q = q.in("status", PORTAL_STATUSES);
  if (search.name) q = ilikeLiteral(q, "full_name", search.name, containing);
  if (search.department) q = ilikeLiteral(q, "department_name", search.department, containing);
  const { data, error } = await q.order("full_name").limit(100);
  return { data: data as StaffDirectoryEntry[] | null, error };
}

/** The ids of up to 20 directory members whose full name contains this text, former staff included. */
export async function staffIdsNamed(name: string) {
  const { data, error } = await ilikeLiteral(selectTeamDirectory("id"), "full_name", name, containing).limit(20);
  return { data: data as { id: string }[] | null, error };
}

/** Up to 10 directory members whose full name contains this text, with their person id: whose photos to find. */
export async function staffPeopleNamed(name: string) {
  const { data, error } = await ilikeLiteral(selectTeamDirectory("person_id, full_name"), "full_name", name, containing).limit(10);
  return { data: data as { person_id: string; full_name: string | null }[] | null, error };
}

export type ActiveEmployee = NamedPerson & { person_id: string | null; email: string | null; department_name: string | null };

/** Active employees (contractors left out) in these departments: the individual summary's people. */
export async function activeEmployeesInDepartments(departments: readonly string[]) {
  const { data, error } = await selectTeamDirectory(`person_id, ${NAME_COLUMNS}, department_name, employment_type`)
    .eq("status", "active")
    .in("department_name", departments)
    .neq("employment_type", "contract");
  return { data: data as ActiveEmployee[] | null, error };
}

export type ActiveStaffMember = NamedPerson & {
  id: string;
  person_id: string | null;
  email: string | null;
  status: string | null;
  department_name: string | null;
};

/** Every active directory member, contractors included, with their department: the daily check-in roster. */
export async function activeStaff() {
  const { data, error } = await selectTeamDirectory(`id, person_id, ${NAME_COLUMNS}, status, department_name`).eq("status", "active");
  return { data: data as ActiveStaffMember[] | null, error };
}
