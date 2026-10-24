import { companyOs } from "@/kernel/data/supabase";
import { ReadFailure, mustRows } from "@/kernel/data/read";
import { NAME_COLUMNS, byFirstName, personName, type NamedPerson } from "@/kernel/config/people-name";
import { CURRENT_TEAM_STATUSES } from "./team-statuses";

// Who is on the team now, what is known about any person by id, and whose a
// team_members row is, read from the kernel's own tables (people,
// team_members) so any entity may ask without reaching into another entity's
// door.
//
// Every read raises on failure. Their callers decide what a person may be named
// as (a company's legal representative) or flag a record whose person has
// gone, so an empty list from a failed read would be a wrong answer, not a
// smaller one.
//
// Not named reads.ts: that file holds only thin select helpers.

export type TeamPerson = { id: string; name: string };

type PersonRow = NamedPerson & { id: string; archived_at: string | null };

const PERSON_FIELDS = `id, ${NAME_COLUMNS}, archived_at`;

// The people rows behind current team memberships, archived ones left out. A
// person with two current memberships appears once.
async function currentTeamPersonRows(): Promise<PersonRow[]> {
  const rows = mustRows(
    await companyOs
      .from("team_members")
      .select(`person:people!team_members_person_id_fkey(${PERSON_FIELDS})`)
      .in("status", CURRENT_TEAM_STATUSES),
    "[identity/team-people] team_members",
  ) as unknown as { person: PersonRow | null }[];
  const byId = new Map<string, PersonRow>();
  for (const { person } of rows) {
    if (person && !person.archived_at) byId.set(person.id, person);
  }
  return [...byId.values()];
}

/** Everyone on the team now, by first name, archived people left out. */
export async function listCurrentTeamPeople(): Promise<TeamPerson[]> {
  return (await currentTeamPersonRows())
    .map((person) => ({ id: person.id, name: personName(person) }))
    .sort((a, b) => byFirstName(a.name, b.name));
}

/**
 * The name columns of everyone on the team now (no email), for a caller that
 * has to match a typed name to a team member. CRM contacts and former members
 * are not in it. Raises on a failed read, like the rest of this file.
 */
export async function listCurrentTeamPeopleNames(): Promise<{ display_name: string | null; preferred_name: string | null; full_name: string | null }[]> {
  return (await currentTeamPersonRows()).map((p) => ({
    display_name: p.display_name ?? null,
    preferred_name: p.preferred_name ?? null,
    full_name: p.full_name ?? null,
  }));
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

/**
 * The person behind a team_members row. Two id spaces name the same human:
 * people.id is who they are, team_members.id is one engagement of theirs, and
 * an event or a foreign key may carry either. A failed read raises, because a
 * null here means "nobody", and a notification or an approval routed to
 * nobody is a wrong answer; a row that does not exist is null.
 */
export async function personIdOfTeamMember(teamMemberId: string): Promise<string | null> {
  const { data, error } = await companyOs.from("team_members").select("person_id").eq("id", teamMemberId).maybeSingle();
  if (error) throw new ReadFailure("[identity/team-people] team_members person", error.message);
  return data?.person_id ?? null;
}
