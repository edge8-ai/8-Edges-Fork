// Kudos (TH.1.8): a teammate thanks another in one line, and the team Home
// shows the month's board. Peer to peer; a coach's note about a coached
// person's work is coaching_noticed, a different relation.
//
// The board is a wall of thanks, never a score: nothing here counts, sums or
// ranks a person, and there is no reader that groups by person. Ranking people
// on recognition received reduces how much they help each other (Evans,
// Presslee and Vandenberg), and the data dictionary's "Do not" says so.
//
// A month is a Saigon calendar month, the same day given_on records.
import { companyOs } from "@/kernel/data/supabase";
import { readOr } from "@/kernel/data/read";
import { one } from "@/kernel/config/embedded";
import { NAME_ONLY_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import { addMonths } from "./kudos-rules";

export type KudosPerson = { personId: string; name: string; avatarUrl: string | null };
export type KudosNote = { id: string; body: string; givenOn: string; from: KudosPerson; to: KudosPerson };

type Person = NamedPerson & { avatar_url: string | null };
type Row = {
  id: string;
  body: string;
  given_on: string;
  from_person_id: string;
  to_person_id: string;
  giver: Person | Person[] | null;
  receiver: Person | Person[] | null;
};

// The board is read by everyone, so it selects names without email: a person
// with no name reads as "A teammate", never as their address.
function person(id: string, raw: Person | Person[] | null): KudosPerson {
  const p = one(raw);
  return { personId: id, name: personName(p, "A teammate"), avatarUrl: p?.avatar_url ?? null };
}

/**
 * A month's board, newest first. Null when the read fails, so a page says it
 * could not load the board instead of showing an empty month (Rule 2).
 */
export async function kudosForMonth(month: string): Promise<KudosNote[] | null> {
  const res = await companyOs
    .from("kudos")
    .select(
      `id, body, given_on, from_person_id, to_person_id, ` +
        `giver:people!kudos_from_person_id_fkey(${NAME_ONLY_COLUMNS}, avatar_url), ` +
        `receiver:people!kudos_to_person_id_fkey(${NAME_ONLY_COLUMNS}, avatar_url)`,
    )
    .gte("given_on", `${month}-01`)
    .lt("given_on", `${addMonths(month, 1)}-01`)
    .is("archived_at", null)
    .order("given_on", { ascending: false })
    .order("created_at", { ascending: false });
  const rows = readOr(res, "kudos for the month", null) as unknown as Row[] | null;
  if (rows === null) return null;
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    givenOn: r.given_on,
    from: person(r.from_person_id, r.giver),
    to: person(r.to_person_id, r.receiver),
  }));
}

/** Writes one kudos; the action has already checked who may give it. */
export async function insertKudos(fromPersonId: string, toPersonId: string, body: string) {
  return companyOs.from("kudos").insert({ from_person_id: fromPersonId, to_person_id: toPersonId, body }).select("id").single();
}

/** Takes down a kudos its giver wrote; archived, never deleted. */
export async function archiveOwnKudos(id: string, personId: string) {
  return companyOs
    .from("kudos")
    .update({ archived_at: new Date().toISOString(), archived_by: personId })
    .eq("id", id)
    .eq("from_person_id", personId)
    .is("archived_at", null)
    .select("id");
}
