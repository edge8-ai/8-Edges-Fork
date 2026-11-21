import { companyOs } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { myProfileId } from "./member";
import type { Result } from "./shared";

// Quick-add a win or a note any time (K.19). Between 1-1s a member notices
// things that are worth saying out loud two weeks later and then forgets them;
// this is the one line of text that keeps them. Member tier throughout: every
// function re-derives the profile from the actor, so a note id from the client
// is only ever acted on after it is proven to sit on the actor's own profile.

export type MemberNote = {
  id: string;
  // The day the note was written, as an ISO timestamp — the list, the brag
  // document and the "since your last 1-1" filter all order by it.
  createdAt: string;
  body: string;
};

export const NOTE_MAX_LENGTH = 1000;

// Pure so the rule is testable without a database: the same trim-then-measure
// the insert applies, expressed once.
export function validateNoteBody(body: string): Result {
  const b = body.trim();
  if (!b) return { ok: false, error: "Write the note first." };
  if (b.length > NOTE_MAX_LENGTH) return { ok: false, error: `Keep it under ${NOTE_MAX_LENGTH} characters.` };
  return { ok: true };
}

export async function addMyNote(actor: TeamActor, body: string): Promise<Result> {
  const profileId = await myProfileId(actor);
  if (!profileId) return { ok: false, error: "You are not in a coaching cycle." };
  const valid = validateNoteBody(body);
  if (!valid.ok) return valid;
  const { error } = await companyOs
    .from("coaching_member_notes")
    .insert({ coaching_profile_id: profileId, body: body.trim() });
  if (error) {
    console.error("[team/coaching/member-notes] insert", error);
    return { ok: false, error: "Could not save the note." };
  }
  return { ok: true };
}

// Archived, not deleted: the brag document may already quote this note, and a
// member tidying their list is not asking for that to be rewritten.
export async function archiveMyNote(actor: TeamActor, noteId: string): Promise<Result> {
  const profileId = await myProfileId(actor);
  if (!profileId || !noteId) return { ok: false, error: "Not found." };
  const { error } = await companyOs
    .from("coaching_member_notes")
    .update({ archived_at: new Date().toISOString() })
    // Scoped to the actor's own profile, so a guessed id from another profile
    // matches nothing rather than archiving somebody else's note.
    .eq("id", noteId)
    .eq("coaching_profile_id", profileId);
  if (error) {
    console.error("[team/coaching/member-notes] archive", error);
    return { ok: false, error: "Could not archive the note." };
  }
  return { ok: true };
}

export async function getMyNotes(actor: TeamActor): Promise<MemberNote[]> {
  const profileId = await myProfileId(actor);
  if (!profileId) return [];
  return notesForProfile(profileId);
}

// The same read for a profile the caller has already proven the actor may see
// (K.26, the quarter in review, which a coach may open for their own member).
// The guard stays with the caller, as it does for historyForProfile.
export async function notesForProfile(profileId: string): Promise<MemberNote[]> {
  const { data, error } = await companyOs
    .from("coaching_member_notes")
    .select("id, body, created_at")
    .eq("coaching_profile_id", profileId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[team/coaching/member-notes] select", error);
    return [];
  }
  return ((data ?? []) as unknown as { id: string; body: string; created_at: string }[]).map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    body: r.body,
  }));
}
