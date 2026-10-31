import { companyOs } from "@/kernel/data/supabase";
import { ReadFailure, mustPagesIn, mustRows } from "@/kernel/data/read";
import { GREETING_COLUMNS, NAME_COLUMNS, byFirstName, greetingName, personName, type GreetedPerson, type NamedPerson } from "@/kernel/config/people-name";
import { CURRENT_TEAM_STATUSES, PORTAL_STATUSES } from "./team-statuses";

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

// "Who is on the team now", defined once: the people rows behind current team
// memberships, archived people and memberships with no person left out, each
// person once however many current memberships they hold. `fields` names the
// people columns a caller needs, and always includes id and archived_at.
// Given `personIds`, only those people are read, a chunk and a page at a time;
// without, the whole current team is.
type CurrentRow = { id: string; archived_at: string | null };

const TEAM_PERSON_JOIN = "person:people!team_members_person_id_fkey";

async function currentTeamRows<P extends CurrentRow>(fields: string, what: string, personIds?: readonly string[]): Promise<P[]> {
  const select = `${TEAM_PERSON_JOIN}(${fields})`;
  type Joined = { person: P | null };
  const rows: Joined[] =
    personIds === undefined
      ? (mustRows(await companyOs.from("team_members").select(select).in("status", CURRENT_TEAM_STATUSES), what) as unknown as Joined[])
      : await mustPagesIn<Joined>(personIds, what, (slice, from, to) =>
          companyOs.from("team_members").select(select).in("status", CURRENT_TEAM_STATUSES).in("person_id", slice).range(from, to),
        );
  const byId = new Map<string, P>();
  for (const { person } of rows) {
    if (person && !person.archived_at) byId.set(person.id, person);
  }
  return [...byId.values()];
}

async function currentTeamPersonRows(): Promise<PersonRow[]> {
  return currentTeamRows<PersonRow>(PERSON_FIELDS, "[identity/team-people] team_members");
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

/**
 * The email address of each person in `ids` who is on the team now (QS.2):
 * where a message about staff-only work may go. Anyone else (a CRM contact, a
 * person who has left, an archived record, a person with no address) is left
 * out, so a sender that addresses only this map cannot reach beyond the staff
 * whatever ids it was handed (the PR #2120 lesson). Raises on a failed read,
 * because an empty map from a failed read would quietly tell nobody.
 */
export async function currentTeamEmails(ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const people = await currentTeamRows<CurrentRow & { email: string | null }>("id, email, archived_at", "[identity/team-people] team emails", unique);
  const emails = new Map<string, string>();
  for (const person of people) {
    const email = person.email?.trim();
    if (email) emails.set(person.id, email);
  }
  return emails;
}

/**
 * A person's live team engagement and the word a page greets them by. The
 * Admin Home (AH.2) keys reviews and coaching by the one and says the other;
 * the reader there is an admin, who may or may not be on the team, so the
 * engagement is null for someone with none. The choice of engagement is the
 * team surface's own (team-auth): an active one first, else any live one.
 */
export async function teamSelfOf(personId: string): Promise<{ teamMemberId: string | null; greeting: string | null }> {
  const [people, memberships] = await Promise.all([
    companyOs.from("people").select(GREETING_COLUMNS).eq("id", personId).maybeSingle(),
    companyOs.from("team_members").select("id, status").eq("person_id", personId).in("status", PORTAL_STATUSES),
  ]);
  if (people.error) throw new ReadFailure("[identity/team-people] people greeting", people.error.message);
  const rows = mustRows(memberships, "[identity/team-people] team_members of person") as { id: string; status: string }[];
  const membership = rows.find((r) => r.status === "active") ?? rows[0] ?? null;
  return { teamMemberId: membership?.id ?? null, greeting: greetingName(people.data as GreetedPerson | null, null) };
}
