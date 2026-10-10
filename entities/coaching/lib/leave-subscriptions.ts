// Coaching's side of an approved leave (S.2, docs/adr/0003).
//
// L.2 built the leave window so that a 1-1 is never booked into somebody's
// holiday, and it works forwards: the coach's picker and the member's propose
// form read `getLeaveSpans` at render and offer the next clear day. What it
// could not do is act on leave approved AFTER the booking — the meeting simply
// sat there in the holiday until the nightly coaching cycle stamped it missed
// and the member was asked, on the day they got back, why their 1-1 did not
// happen.
//
// So this replaces a scan with a reaction: time-off states the approval, and
// the booking moves once, then, instead of being re-derived by every page that
// renders it and finally reported as a miss by a cron.
//
// Time off may not import coaching — it `requires` nothing and sits at the
// bottom of the graph — which is exactly the shape the bus exists for. A
// deployment with leave and no coaching has no subscriber and nothing breaks.
import { companyOs } from "@/kernel/data/supabase";
import { addDays } from "@/kernel/config/dates";
import type { EventPayload } from "@/kernel/events";
import { nextClearDay, onLeave, type LeaveSpan } from "./leave-window";
import { getLeaveSpans } from "./data/leave";
import { applyMeetingMove, liveScheduledRowOn } from "./data/move-meeting";

/** What the row says, in the vocabulary this module reasons in. */
export type BookedOneOnOne = { id: string; heldOn: string; status: string };

/** One booking and the day it should move to. */
export type MeetingMove = { meetingId: string; from: string; to: string };

// The sentence the row carries afterwards, in the coach's own voice. A day
// somebody is away is a fact about a colleague's holiday, not a conflict or an
// error, and the History view reads this line back verbatim.
const MOVE_REASON = "Moved off approved leave";

/**
 * Which of a profile's bookings this approval moves, and where each goes.
 *
 * Pure, so the rule can be read and tested without a database — the same
 * reasoning as leave-window.ts, which it leans on for "is this day clear".
 *
 * `announced` decides WHICH meetings move: only the leave just approved, never
 * a holiday that was already known about, because that one was either already
 * scheduled around or already answered. `spans` decides WHERE they go, and is
 * the member's whole known absence, so a move never lands on the next holiday.
 *
 * Successive moves take successive clear days: one live row per profile and
 * date, so two bookings inside one holiday cannot both take the day after it.
 */
export function movesForLeave(
  meetings: BookedOneOnOne[],
  announced: LeaveSpan,
  spans: LeaveSpan[],
): MeetingMove[] {
  const covered = meetings
    // Only a booking still ahead of anybody: a 1-1 already held or skipped is a
    // record of what happened, and a holiday approved afterwards does not
    // rewrite it.
    .filter((m) => m.status === "scheduled" && onLeave(m.heldOn, [announced]))
    .sort((a, b) => a.heldOn.localeCompare(b.heldOn));

  const moves: MeetingMove[] = [];
  let from = addDays(announced.endDate, 1);
  for (const m of covered) {
    // Each booking keeps its own weekday: the rhythm is the day the pair agreed,
    // and the first clear day alone can be a Saturday (A.31).
    const to = nextClearDay(from, spans, new Date(`${m.heldOn}T00:00:00`).getDay());
    // Null is a real answer, not a failure: a member away for the whole horizon
    // keeps their booking where it is rather than being handed a date past it.
    if (!to) break;
    moves.push({ meetingId: m.id, from: m.heldOn, to });
    from = addDays(to, 1);
  }
  return moves;
}

/** The profile whose rhythm this member is on, or null when nobody coaches them. */
async function activeProfileFor(teamMemberId: string): Promise<{ id: string } | null> {
  const { data, error } = await companyOs
    .from("coaching_profiles")
    .select("id")
    .eq("team_member_id", teamMemberId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(`coaching profile for ${teamMemberId} not read: ${error.message}`);
  return (data as { id: string } | null) ?? null;
}

/** Every live booking of this profile inside the approved span. */
async function bookingsInside(profileId: string, span: LeaveSpan): Promise<BookedOneOnOne[]> {
  const { data, error } = await companyOs
    .from("coaching_one_on_ones")
    .select("id, held_on, status")
    .eq("coaching_profile_id", profileId)
    .is("archived_at", null)
    .gte("held_on", span.startDate)
    .lte("held_on", span.endDate);
  if (error) throw new Error(`1-1s inside ${span.startDate}..${span.endDate} not read: ${error.message}`);
  return ((data ?? []) as { id: string; held_on: string; status: string }[]).map((r) => ({
    id: r.id,
    heldOn: r.held_on,
    status: r.status,
  }));
}

/**
 * Move a 1-1 the newly approved leave now covers.
 *
 * Throws rather than swallowing a failed write: the bus logs and audits it, and
 * a silent drop here would leave the booking sitting inside the holiday with
 * nothing anywhere saying it was meant to move.
 */
export async function moveOneOnOnesOffLeave(payload: EventPayload<"leave.approved">): Promise<void> {
  const profile = await activeProfileFor(payload.teamMemberId);
  if (!profile) return;

  const announced: LeaveSpan = { startDate: payload.startDate, endDate: payload.endDate };
  const booked = await bookingsInside(profile.id, announced);
  if (booked.length === 0) return;

  // The announced span is listed first and unconditionally, so a failed read of
  // the member's other leave (getLeaveSpans logs and returns []) still moves
  // the booking off the holiday that has just been approved.
  const spans = [announced, ...(await getLeaveSpans(payload.teamMemberId, payload.endDate))];

  for (const move of movesForLeave(booked, announced, spans)) {
    // Someone else's booking already holds the day. Leaving this one where it
    // is beats writing a row the unique index would refuse.
    if (await liveScheduledRowOn(profile.id, move.to)) continue;
    const moved = await applyMeetingMove({
      meetingId: move.meetingId,
      from: move.from,
      to: move.to,
      reason: MOVE_REASON,
    });
    if (!moved.ok) throw new Error(`1-1 ${move.meetingId} not moved off leave: ${moved.error}`);
  }
}
