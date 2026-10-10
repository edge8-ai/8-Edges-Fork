import { companyOs } from "@/kernel/data/supabase";
import { NAME_COLUMNS, byFirstName, personName, type NamedPerson } from "@/kernel/config/people-name";

// The one list of people who can be given work: owners, assignees, custody
// holders. Everything that renders a PersonSelect sources from here.
//
// Assignability is driven by team_members.status, never by people.persona.
// persona is the CRM lifecycle tag and drifts from employment reality in both
// directions: active staff still carrying job_seeker from before they were
// hired, and leavers keeping persona='employee' forever.
//
// Employees and contractors both appear, so employment_type is not filtered.
// Contractors are team_members with employment_type='contract'.

export type PersonOption = { id: string; name: string };

// Still on the payroll: at work, on leave, or working out notice. Excludes
// pre_start (hasn't started), terminated and alumni (gone).
//
// These are the real values in company_os.team_members.status. An earlier
// version of this filter excluded "inactive" and "offboarded", which are not
// values that column has ever held, so it matched nothing and every leaver
// stayed in the pickers.
export const ASSIGNABLE_STATUSES = ["active", "on_leave", "notice"] as const;

const PERSON_FIELDS = `id, ${NAME_COLUMNS}, archived_at`;

type PersonRow = NamedPerson & { id: string; archived_at: string | null };

export function toOptions(rows: (PersonRow | null)[]): PersonOption[] {
  return rows
    .filter((p): p is PersonRow => Boolean(p && !p.archived_at))
    .map((p) => ({ id: p.id, name: personName(p) }))
    .sort((a, b) => byFirstName(a.name, b.name));
}

export async function listAssignablePeople(): Promise<PersonOption[]> {
  const { data, error: assignableErr } = await companyOs
    .from("team_members")
    .select(`person:people!team_members_person_id_fkey(${PERSON_FIELDS})`)
    .in("status", ASSIGNABLE_STATUSES);
  if (assignableErr) console.error("[company-os/crm] team_members", assignableErr);

  const rows = (data ?? []) as unknown as { person: PersonRow | null }[];
  return toOptions(rows.map((r) => r.person));
}

// Names for people who are no longer assignable but are still attached to a
// record: a metric owned by someone who left, an issue assigned before they
// went. Archived people are included here on purpose, the record still has to
// render a name.
export async function listPeopleNames(ids: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return new Map();
  const { data, error: namesErr } = await companyOs.from("people").select(PERSON_FIELDS).in("id", unique);
  if (namesErr) console.error("[company-os/crm] people", namesErr);
  const rows = (data ?? []) as unknown as PersonRow[];
  return new Map(rows.map((p) => [p.id, personName(p)]));
}
