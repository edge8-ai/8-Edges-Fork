import { companyOs } from "@/kernel/data/supabase";
import { patchMeeting, type Result } from "./shared";

// Moving a booked 1-1 to another day, and the occupancy rule that goes with it.
//
// It sits in its own module because two callers now write the same move: the
// coach doing it by hand (data/one-on-ones.ts) and coaching's `leave.approved`
// subscriber getting a meeting out of somebody's holiday. A second copy of the
// three columns a move writes is how the coach's move and the automatic one
// would end up disagreeing about what a move records.

/**
 * The live row on a profile's date, if any.
 *
 * One live row per profile and date — a partial unique index enforces it — so
 * this is both the "is the day taken" question and the reason a caller has to
 * ask it before writing rather than letting the insert fail.
 */
export async function liveScheduledRowOn(
  profileId: string,
  dateISO: string,
): Promise<{ id: string; status: string } | null> {
  const { data, error } = await companyOs
    .from("coaching_one_on_ones")
    .select("id, status")
    .eq("coaching_profile_id", profileId)
    .eq("held_on", dateISO)
    .is("archived_at", null)
    .maybeSingle();
  if (error) {
    console.error("[team/coaching/one-on-ones] coaching_one_on_ones", error);
    return null;
  }
  return (data as { id: string; status: string } | null) ?? null;
}

/**
 * Write the move: the new day, where it came from, and why. A move answers a
 * passed-unheld 1-1 by itself: the booking is on a day that has not passed, so
 * the prompt goes away on both pages with nothing to clear (ADR-0010).
 *
 * The caller has already decided the move is allowed and the day is free.
 */
export async function applyMeetingMove(input: {
  meetingId: string;
  from: string;
  to: string;
  reason: string;
}): Promise<Result> {
  // starts_at is deliberately left alone: the member's preferred time is a
  // property of the person, not of the day the meeting landed on.
  return patchMeeting(input.meetingId, {
    held_on: input.to,
    moved_from: input.from,
    move_reason: input.reason.trim(),
  });
}
