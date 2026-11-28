import { companyOs } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { assertCoachOwnsMeeting } from "./one-on-ones";
import { assertCoachOwnsProfile, patchMeeting, type Result } from "./shared";

// The two reads and one write behind the roster's action bar (K.57). They live
// here rather than in one-on-ones.ts because that file is at its size cap, and
// because they belong to one another: the bar's undo window and the bar's
// drawer are both "the row does it without a page load".

// Undo a mark-held done from the roster row, inside the toast's window.
//
// The window is deliberately narrow in what it will reverse. Only a 1-1 marked
// held after its day (held late) can be un-held, and only while it
// carries none of the things a real meeting leaves behind — a recap, a
// published recap, a transcript. That is exactly the row the bar's "Mark it
// held" wrote, and nothing else: a 1-1 that was genuinely held and written up
// can never be reopened by a stray click on a stale toast.
//
// One thing the undo cannot restore: the coach's private voltage note, which
// every path that closes a 1-1 clears by design (K.23), because nothing about
// the coach's state before the hour should outlive it. Restoring it would mean
// carrying that private line through the browser to put it back.
export async function coachUndoMarkOneOnOneHeld(actor: TeamActor, meetingId: string): Promise<Result> {
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  const m = owned.meeting;
  if (m.status !== "held") return { ok: false, error: "That 1-1 is not marked held." };
  if (!m.heldLate) return { ok: false, error: "Only a missed booking can be put back." };
  if (m.summaryMarkdown?.trim() || m.sharedSummaryMarkdown?.trim() || m.sharedPublishedAt || m.transcript)
    return { ok: false, error: "That 1-1 has been written up. Open it to change it." };
  // The held-late stamp goes with the mark it recorded: the booking is back to
  // waiting on an answer, and a later answer writes its own day.
  return patchMeeting(meetingId, { status: "scheduled", marked_held_on: null });
}

export type LastRecap = {
  heldOn: string;
  // The coach's own recap, falling back to the half the member can see; null
  // when the 1-1 was held and never written up, which the drawer says in words.
  markdown: string | null;
};

// The previous 1-1's recap, loaded only when the coach opens the drawer.
//
// It is a second read rather than a column on the roster query on purpose: a
// recap body is long prose, the roster renders one line per person, and
// fetching every recap on every page load to show at most one of them is the
// kind of read that is invisible until a coach has twenty people.
export async function getLastRecap(actor: TeamActor, profileId: string): Promise<LastRecap | null> {
  const profile = await assertCoachOwnsProfile(actor, profileId);
  if (!profile) return null;
  const { data, error } = await companyOs
    .from("coaching_one_on_ones")
    .select("held_on, summary_markdown, shared_summary_markdown")
    .eq("coaching_profile_id", profileId)
    .eq("status", "held")
    .is("archived_at", null)
    .order("held_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[team/coaching/row-bar] coaching_one_on_ones", error);
    return null;
  }
  if (!data) return null;
  const row = data as { held_on: string; summary_markdown: string | null; shared_summary_markdown: string | null };
  return {
    heldOn: row.held_on,
    markdown: row.summary_markdown?.trim() || row.shared_summary_markdown?.trim() || null,
  };
}
