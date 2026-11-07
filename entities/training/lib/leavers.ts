// TR.11, leavers (training tracking spec, "The rules that live in the model"):
// when a person leaves, their reviews stay in the counts, their signed notes
// lose the name, and their outcomes follow their person record.
//
// Nothing is written when somebody leaves, and nothing needs to be. A review
// hangs off a register row and the register row off the person, by keys that
// refuse a delete (training_reviews_attended_only and
// training_attendance_person_id_fkey are ON DELETE RESTRICT), so a leaver's
// reviews are still there for the programme read to count. What a leaver
// loses is their name: `signed` is the member's choice to put their name on a
// note while they are on the team, and the name is never stored on the
// review. It is resolved here, when the note is read, so it is gone the day
// they leave and back if they return.
//
// "On the team" is the team gate's own set (PORTAL_STATUSES), named rather
// than spelled (kernel/identity/team-statuses): a person who can no longer
// open the team hub has left, and so has a person with no membership at all.
//
// The programme read (TR.7) is the reader: it asks noteAuthors for the people
// behind the signed notes in a slice and prints noteSignature beside each.
// Outcomes do not exist yet (TR.6); when they do, their rule joins this file.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { personName, NAME_ONLY_COLUMNS, type NamedPerson } from "@/kernel/config/people-name";
import { PORTAL_STATUSES } from "@/kernel/identity/team-statuses";

/** The person behind a note: what they are called, and whether they are still on the team. */
export type NoteAuthor = { name: string; onTeam: boolean };

/**
 * Pure: the name a review's note carries in the programme read. Only a signed
 * note, only while its author is on the team, and only when the author has a
 * name to show; every other note is nameless.
 */
export function noteSignature(review: { note: string | null; signed: boolean }, author: NoteAuthor | undefined): string | null {
  if (!review.signed || review.note === null || !author?.onTeam) return null;
  return author.name;
}

/**
 * The authors of signed notes, by person id: their name, and whether they are
 * still on the team. A failed read raises (rule 2): answering "on the team"
 * by default would put a leaver's name back on their words, and answering
 * "left" would strip a name a member chose to give. Names leave out the email,
 * because the programme read is seen by people who may not see the address.
 */
export async function noteAuthors(personIds: readonly string[]): Promise<Map<string, NoteAuthor>> {
  const ids = [...new Set(personIds)];
  if (ids.length === 0) return new Map();
  const people = mustRows(await companyOs.from("people").select(`id, ${NAME_ONLY_COLUMNS}`).in("id", ids), "[training/leavers] people") as (NamedPerson & { id: string })[];
  const members = mustRows(
    await companyOs.from("team_members").select("person_id").in("person_id", ids).in("status", PORTAL_STATUSES),
    "[training/leavers] team_members",
  ) as { person_id: string }[];
  const onTeam = new Set(members.map((m) => m.person_id));
  const authors = new Map<string, NoteAuthor>();
  for (const p of people) {
    const name = personName(p, null);
    authors.set(p.id, { name: name ?? "", onTeam: name !== null && onTeam.has(p.id) });
  }
  return authors;
}
