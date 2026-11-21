import { companyOs } from "@/kernel/data/supabase";
import { saigonToday } from "@/kernel/config/dates";
import { assertCoachOwnsMeeting } from "./one-on-ones";
import { patchMeeting, type Result } from "./shared";
import type { TeamActor } from "@/kernel/identity/team-auth";

// When a booked 1-1 starts (K.71). Every write of coaching_one_on_ones.starts_at
// that happens after the row exists comes through here — the coach's own edit,
// the time that rides along with a rebooking, and the backfill a member sets off
// by naming their preferred slot — so the three are one implementation rather
// than three that drift.
//
// Before this, the column had exactly one source: the member's preferred_time,
// copied onto the row at insert. A member who never opened that form could never
// have a 1-1 with a time on it, because a move deliberately left starts_at alone
// and nothing later repaired it; the calendar file then fell back to an all-day
// event. One writer is what makes "nothing later repaired it" impossible to
// reintroduce.

// Set or clear the time of a booking without moving it. Separate from the move
// because they are separate decisions: a coach who puts 15:00 on tomorrow's 1-1
// is not rescheduling it, and asking them for a reason the member will read
// would be asking them to explain a decision they did not make.
export async function coachSetOneOnOneTime(
  actor: TeamActor,
  meetingId: string,
  time: string | null,
): Promise<Result> {
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  return patchMeeting(meetingId, { starts_at: time });
}

// Put a newly named preferred time onto the bookings that have none (K.34).
// Only rows with no time are touched: a time somebody picked for one meeting is
// a decision about that meeting, and a later change of standing preference must
// not silently overwrite it. Past bookings are left alone — nobody recorded when
// a meeting that already happened was due to start, and inventing it now would
// put a time on a row the coach never chose one for.
export async function fillMissingTimesFromPreference(profileId: string, time: string): Promise<Result> {
  const { error } = await companyOs
    .from("coaching_one_on_ones")
    .update({ starts_at: time, updated_at: new Date().toISOString() })
    .eq("coaching_profile_id", profileId)
    .eq("status", "scheduled")
    .is("archived_at", null)
    .is("starts_at", null)
    .gte("held_on", saigonToday());
  if (error) {
    console.error("[team/coaching/one-on-one-time] backfill", error);
    return { ok: false, error: "Could not put the time on the bookings already made." };
  }
  return { ok: true };
}
