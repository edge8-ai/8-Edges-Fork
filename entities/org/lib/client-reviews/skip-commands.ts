import { companyOs, type Json } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { publish } from "@/kernel/events";
import { personName, NAME_COLUMNS, type NamedPerson } from "@/kernel/config/people-name";
import { isPartSubmitted, isSkipManagerLinkValid } from "./rules";
import { canSkipManagerWrite, type SkipWriteRefusal } from "./skip-rules";
import { notesOf, raterFieldsOf, skipCycle, skipCycleRows, skipMemberFacts, type SkipCycle, type ContactKey } from "./skip-manager";
import type { ClientPartRow } from "./access";

// What the skip-manager's link may write (CR.3.2, stories 46 to 49): a note
// beside one of the client manager's answers, and the Reviewed mark. Both go
// on the skip-manager's own part of the member's review, a row of its own,
// so nothing of theirs is ever written onto the client manager's row and no
// rating can change here. Each write asks the rules module again (./skip-rules)
// with the token checked against the cycle's own: a request made by hand gets
// exactly what the page offers.

export type SkipWriteResult = { ok: true; at: string } | { ok: false; error: string };

const GONE = "This link no longer works. Ask the person who sent it to you for the current link.";

const REFUSED: Record<SkipWriteRefusal, string> = {
  no_match: GONE,
  cancelled: GONE,
  cycle_closed: "This review has closed, so it can no longer change.",
  member_withdrawn: "This person is no longer in the review.",
  waiting_on_client_manager: "This review is not ready for you yet.",
  no_part: "This review is not ready for you yet.",
  already_reviewed: "You marked this review Reviewed, so its notes can no longer change.",
};

/** The longest note kept: a note is a few sentences, not a document. */
const NOTE_MAX = 4000;

type Writable = { ok: true; cycle: SkipCycle; part: ClientPartRow } | { ok: false; error: string };

async function writable(cycleId: string, key: ContactKey, teamMemberId: string): Promise<Writable> {
  const found = await skipCycle(cycleId, key);
  if (!found) return { ok: false, error: GONE };
  // The link answers for itself first, so a cancelled or closed link says so
  // whichever member the request names (the boundary review on PR 2606).
  const link = isSkipManagerLinkValid(
    // skipCycle has already set a cancelled link aside for the skip-manager signed in (CR.3.6).
    { closedAt: found.cycle.closed_at, hasSkipManager: found.cycle.skip_manager_person_id !== null, skipManagerLinkCancelled: found.cycle.skip_manager_link_cancelled_at !== null },
    { tokenMatches: found.tokenMatches },
  );
  if (!link.ok) return { ok: false, error: REFUSED[link.reason] };
  const rows = await skipCycleRows(found.cycle.id);
  const member = skipMemberFacts(found.cycle, rows, teamMemberId);
  if (!member) return { ok: false, error: REFUSED.waiting_on_client_manager };
  const may = canSkipManagerWrite(member.facts, { tokenMatches: found.tokenMatches });
  if (!may.ok) return { ok: false, error: REFUSED[may.reason] };
  return { ok: true, cycle: found.cycle, part: member.parts.skipManager! };
}

/**
 * Saves the skip-manager's note beside one question, or clears it when the
 * text is empty. The key must be one of the rater's questions, so a note can
 * only sit beside an answer. The write lands only while the part is still
 * open, so a note sent after the Reviewed mark is refused, not kept.
 */
export async function saveSkipManagerNote(cycleId: string, contact: ContactKey, teamMemberId: string, key: string, text: string): Promise<SkipWriteResult> {
  if (text.length > NOTE_MAX) return { ok: false, error: `A note can be at most ${NOTE_MAX} characters.` };
  const may = await writable(cycleId, contact, teamMemberId);
  if (!may.ok) return may;
  const keys = new Set((await raterFieldsOf(may.cycle.framework_id)).map((f) => f.config?.maps_to).filter((k): k is string => typeof k === "string"));
  if (!keys.has(key)) return { ok: false, error: "That note has no answer to sit beside." };

  const notes = notesOf(may.part);
  const trimmed = text.trim();
  if (trimmed) notes[key] = trimmed;
  else delete notes[key];
  const at = new Date().toISOString();
  const { data, error } = await companyOs
    .from("performance_reviews")
    .update({ metadata: { ...(may.part.metadata ?? {}), comments: notes, notes_saved_at: at } as Json })
    .eq("id", may.part.id)
    .in("status", ["open", "draft"])
    .select("id");
  if (error) return { ok: false, error: "Your note could not be saved. Try again in a moment." };
  if (!data?.length) return { ok: false, error: REFUSED.already_reviewed };
  return { ok: true, at };
}

/**
 * Marks one member Reviewed: the skip-manager's part is sent with the notes it
 * holds, and locked. One press, as the approved prototype has it. When it is
 * the last member still in the cycle, the person who opened the cycle is told
 * once in their Inbox; telling them never fails the mark.
 */
export async function markSkipManagerReviewed(cycleId: string, contact: ContactKey, teamMemberId: string): Promise<SkipWriteResult> {
  const may = await writable(cycleId, contact, teamMemberId);
  if (!may.ok) return may;
  const at = new Date().toISOString();
  const { data, error } = await companyOs
    .from("performance_reviews")
    .update({ status: "submitted", submitted_at: at })
    .eq("id", may.part.id)
    .in("status", ["open", "draft"])
    .select("id");
  if (error) return { ok: false, error: "That could not be saved. Try again in a moment." };
  if (!data?.length) return { ok: false, error: REFUSED.already_reviewed };
  await tellOpenerWhenAllMarked(may.cycle).catch((err: unknown) => console.error(`[org/client-reviews] ${may.cycle.id} opener not told:`, err));
  return { ok: true, at };
}

/**
 * Tells the cycle's opener once every member still in it is marked Reviewed
 * (spec, "Telling people"). Read fresh after the mark, so two marks landing
 * together cannot each think the other is still missing. The fact carries the
 * number of members, so a member added afterwards and marked tells again,
 * while a repeat of the same moment is written once.
 */
async function tellOpenerWhenAllMarked(cycle: SkipCycle): Promise<void> {
  const rows = await skipCycleRows(cycle.id);
  const stillIn = rows.members.filter((m) => m.withdrawn_at === null);
  if (stillIn.length === 0) return;
  const marked = (m: { team_member_id: string }) =>
    isPartSubmitted(rows.parts.find((p) => p.team_member_id === m.team_member_id && p.rater_kind === "skip_manager") ?? null);
  if (!stillIn.every(marked)) return;
  const skipManager = cycle.skip_manager_person_id
    ? (mustRows(
        await companyOs.from("people").select(NAME_COLUMNS).eq("id", cycle.skip_manager_person_id).limit(1),
        "[org/client-reviews] people",
      )[0] as NamedPerson | undefined)
    : undefined;
  await publish("review.cycle.all_marked", {
    cycleId: cycle.id,
    ownerPersonId: cycle.opened_by,
    cycleName: cycle.name,
    skipManagerName: personName(skipManager ?? null, "The skip-manager"),
    members: stillIn.length,
    overviewPath: `/admin/talent/reviews/clients/${cycle.id}`,
  });
}
