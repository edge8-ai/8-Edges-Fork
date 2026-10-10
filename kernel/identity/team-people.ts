import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { NAME_COLUMNS, byFirstName, personName, type NamedPerson } from "@/kernel/config/people-name";

// Who is on the team now, and what is known about any person by id, read from
// the kernel's own tables (people, team_members) so any entity may ask without
// reaching into another entity's door.
//
// Both reads raise on failure. Their callers decide what a person may be named
// as (a company's legal representative) or flag a record whose person has
// gone, so an empty list from a failed read would be a wrong answer, not a
// smaller one.
//
// Not named reads.ts: that file holds only thin select helpers.

/**
 * Still on the payroll: at work, on leave, or working out notice. The same
 * three statuses the CRM's assignable-people list uses; pre_start has not
 * started and terminated or alumni have gone.
 */
export const CURRENT_TEAM_STATUSES = ["active", "on_leave", "notice"] as const;

export type TeamPerson = { id: string; name: string };

type PersonRow = NamedPerson & { id: string; archived_at: string | null };

const PERSON_FIELDS = `id, ${NAME_COLUMNS}, archived_at`;

/** Everyone on the team now, by first name, archived people left out. */
export async function listCurrentTeamPeople(): Promise<TeamPerson[]> {
  const rows = mustRows(
    await companyOs
      .from("team_members")
      .select(`person:people!team_members_person_id_fkey(${PERSON_FIELDS})`)
      .in("status", CURRENT_TEAM_STATUSES),
    "[identity/team-people] team_members",
  ) as unknown as { person: PersonRow | null }[];
  const byId = new Map<string, TeamPerson>();
  for (const { person } of rows) {
    // A person with two current memberships appears once.
    if (person && !person.archived_at) byId.set(person.id, { id: person.id, name: personName(person) });
  }
  return [...byId.values()].sort((a, b) => byFirstName(a.name, b.name));
}

/** A person as a record names them: their name, and whether they have been archived since. */
export type PersonOnRecord = { name: string; archived: boolean };

/** People by id, archived ones included: a record still has to name whoever it points at. */
export async function peopleOnRecord(ids: string[]): Promise<Map<string, PersonOnRecord>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const rows = mustRows(
    await companyOs.from("people").select(PERSON_FIELDS).in("id", unique),
    "[identity/team-people] people",
  ) as unknown as PersonRow[];
  return new Map(rows.map((p) => [p.id, { name: personName(p), archived: p.archived_at !== null }]));
}
