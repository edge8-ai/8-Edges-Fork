import type { TeamActor } from "@/kernel/identity/team-auth";
import { myProfileId } from "./member";
import { patchProfile, type Result } from "./shared";
import { fillMissingTimesFromPreference } from "./one-on-one-time";

// The member's preferred time of day for 1-1s (K.34). The member states it on
// their own page; the coach reads it; a booking without a time of its own starts
// at it. There is no preferred weekday any more: the pair's rhythm is the day
// they actually meet, which the 1-1 schedule reads off their 1-1s (A.31).
// Member tier: the profile is always the actor's own, never a client id.

export type PreferredSlot = { time: string | null };

// The time is "HH:MM" on a 24-hour clock.
export function validatePreferredSlot(input: PreferredSlot): Result {
  if (input.time !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time))
    return { ok: false, error: "Give the time as HH:MM." };
  return { ok: true };
}

export async function saveMyPreferredSlot(actor: TeamActor, input: PreferredSlot): Promise<Result> {
  const profileId = await myProfileId(actor);
  if (!profileId) return { ok: false, error: "You are not in a coaching cycle." };
  const valid = validatePreferredSlot(input);
  if (!valid.ok) return valid;
  const saved = await patchProfile(profileId, { preferred_time: input.time });
  if (!saved.ok || input.time === null) return saved;
  // A preference stated today is about the 1-1 already in the diary as much as
  // about the ones after it (K.71). Without this the member names 15:00 and
  // tomorrow's booking stays timeless, because the preference is only read when
  // a row is inserted — which is how somebody can fill this form in and see
  // nothing change anywhere.
  //
  // The backfill's failure is not the member's, and it is not visible either:
  // both pages read a booking's time through meetingStartsAt, which falls back
  // to this same preference, so a row that missed out still shows the right
  // hour everywhere. What the write buys is not display but PINNING — a 1-1
  // agreed while the preference said 15:00 keeps 15:00 when the preference
  // later becomes 16:00, where an unwritten row would silently follow it. So a
  // failure costs that pinning and nothing else, and the answer stays "saved".
  await fillMissingTimesFromPreference(profileId, input.time);
  return saved;
}
