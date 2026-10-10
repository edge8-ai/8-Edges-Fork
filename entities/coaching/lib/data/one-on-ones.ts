import { companyOs } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { saveCoachingTranscript } from "@/entities/coaching/lib/transcript";
import { saigonToday } from "@/kernel/config/dates";
import { describeDay, validateProposedDate } from "@/entities/coaching/lib/cadence";
import { one } from "@/kernel/config/embedded";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { notifyBoth } from "@/entities/coaching/lib/cycle-shared";
import { OPEN_COMMITMENT_STATUSES, type OneOnOneStatus } from "../types";
import { MEETING_SELECT, toOneOnOne, type OneOnOne } from "./profile";
import { assertCoachOwnsProfile, patchMeeting, type Result } from "./shared";
import { applyMeetingMove, liveScheduledRowOn } from "./move-meeting";
import { loadScheduleFor } from "./one-on-one-schedule";

// Create a 1-1 row. `held` logs a meeting that already happened (transcript
// flow follows); `scheduled` books one. The booking is the whole record: the
// 1-1 schedule reads it, and nothing is mirrored onto the profile (ADR-0010).
export async function coachCreateOneOnOne(
  actor: TeamActor,
  profileId: string,
  heldOn: string,
  status: Extract<OneOnOneStatus, "scheduled" | "held">,
  // A time the coach picked; left out, the member's standing preference is used.
  time?: string | null,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const profile = await assertCoachOwnsProfile(actor, profileId);
  if (!profile) return { ok: false, error: "Not found." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(heldOn)) return { ok: false, error: "Bad date." };
  if (status !== "scheduled" && status !== "held") return { ok: false, error: "Bad status." };

  // The day decides which kind of row this can be (K.79). Neither check existed:
  // "Log a past 1-1" took a future date and marked the upcoming booking held
  // ahead of time, and confirming a member's proposal whose day had passed
  // booked the past, which the roster then reported as a 1-1 that did not
  // happen.
  const today = saigonToday();
  if (status === "held" && heldOn > today) {
    return { ok: false, error: "A 1-1 you log has already happened. Pick today or an earlier day." };
  }
  if (status === "scheduled" && heldOn < today) {
    return { ok: false, error: "Pick a day that has not passed." };
  }
  // One booking ahead at a time: the 1-1 schedule calls the earliest one "next",
  // and a second insert left the first behind to turn into a missed 1-1 (K.79).
  // Booking the day the current one is already on falls through to the live-row
  // check below, which treats it as the same meeting.
  if (status === "scheduled") {
    let booked;
    try {
      booked = (await loadScheduleFor(profileId, today)).booked;
    } catch {
      return { ok: false, error: "Could not load the 1-1s. Try again." };
    }
    if (booked && booked.day !== heldOn) {
      return { ok: false, error: `A 1-1 is already booked for ${describeDay(booked.day)}. Move that one instead.` };
    }
  }
  // The time the coach named, else the member's standing preference (K.34); a
  // logged past meeting gets none, since nobody recorded when it started.
  const startsAt = status === "scheduled" ? (time ?? (profile.preferred_time as string | null) ?? null) : null;

  // One live row per profile and date (a partial unique index enforces it).
  // A row already on that date is the meeting the coach means: the cron
  // scheduled it, and "log it as held" marks it held rather than inserting a
  // twin the index would reject anyway.
  const live = await liveScheduledRowOn(profileId, heldOn);

  let id: string;
  if (live) {
    if (status === "held" && live.status !== "held") {
      const { error } = await companyOs
        .from("coaching_one_on_ones")
        .update({ status: "held", coach_voltage_md: null, updated_at: new Date().toISOString() })
        .eq("id", live.id);
      if (error) return { ok: false, error: "Could not update the 1-1." };
    }
    id = live.id;
  } else {
    const { data, error } = await companyOs
      .from("coaching_one_on_ones")
      .insert({ coaching_profile_id: profileId, held_on: heldOn, status, starts_at: startsAt })
      .select("id")
      .maybeSingle();
    if (error || !data) return { ok: false, error: "Could not create the 1-1." };
    id = (data as { id: string }).id;
  }
  return { ok: true, id };
}

// Meeting-scoped ownership: the meeting must belong to a profile this actor
// coaches. Returns { meeting, profileId } or null.
export async function assertCoachOwnsMeeting(
  actor: TeamActor,
  meetingId: string,
): Promise<{ meeting: OneOnOne; profileId: string } | null> {
  if (!meetingId) return null;
  const { data, error: dataError } = await companyOs
    .from("coaching_one_on_ones")
    .select(`${MEETING_SELECT}, coaching_profiles:coaching_profiles!coaching_profile_id(coach_id)`)
    .eq("id", meetingId)
    .is("archived_at", null)
    .maybeSingle();
  if (dataError) console.error("[team/coaching/one-on-ones] coaching_one_on_ones", dataError);
  if (!data) return null;
  const r = data as unknown as Record<string, unknown>;
  const prof = one(r.coaching_profiles as { coach_id: string } | { coach_id: string }[] | null);
  if (prof?.coach_id !== actor.teamMemberId) return null;
  return { meeting: toOneOnOne(r), profileId: r.coaching_profile_id as string };
}

// Save the transcript and mark the meeting held. The AI summary runs after
// this (lib/coaching/ai.ts); saving the raw transcript never blocks on it.
export async function coachSaveTranscript(
  actor: TeamActor,
  meetingId: string,
  transcript: string,
): Promise<Result> {
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  const text = transcript.trim();
  if (!text) return { ok: false, error: "Paste the transcript first." };
  if (text.length > 400_000) return { ok: false, error: "Transcript is too long." };
  // Transcript is stored on the linked meeting (call_transcripts), not on the
  // coaching row.
  const saved = await saveCoachingTranscript(meetingId, text);
  if (!saved.ok) return saved;
  return patchMeeting(meetingId, { status: "held", coach_voltage_md: null });
}

// Skip a 1-1 with a reason (K.9). A skipped week is a fact about the rhythm,
// not an absence of one: the row stays in the log carrying why. Nothing else is
// written: a skip anchors the suggested date the way a held 1-1 does, and the
// 1-1 schedule computes it when it is read (ADR-0010).
export async function coachSkipOneOnOne(
  actor: TeamActor,
  meetingId: string,
  reason: string,
): Promise<Result> {
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  const text = reason.trim();
  if (!text) return { ok: false, error: "Say why it was skipped." };
  if (text.length > 500) return { ok: false, error: "Keep the reason to a line." };
  return patchMeeting(meetingId, { status: "skipped", skip_reason: text });
}

// Move a 1-1 instead of skipping it (K.33). Skip says the cycle did not
// happen; a move says the same meeting is on another day, so the row survives
// with its id, and everything hung off that id — the prep, the member's
// pre-meeting answers, the commitments made against it — survives with it.
// The whole refusal rule is pure, so it reads and tests without a database.
export function moveOutcome(
  meeting: { status: OneOnOneStatus; heldOn: string },
  newDateISO: string,
  reason: string,
  todayISO: string,
): Result {
  // A meeting that happened is history; a skipped one is a cycle that did not
  // happen. Neither is a thing you reschedule — the coach books a new one.
  if (meeting.status === "held") return { ok: false, error: "A 1-1 that was held cannot be moved." };
  if (meeting.status === "skipped") return { ok: false, error: "A skipped 1-1 cannot be moved. Book the next one." };
  const valid = validateProposedDate(newDateISO, todayISO);
  if (!valid.ok) return valid;
  if (newDateISO === meeting.heldOn) return { ok: false, error: "That is the day it is already on." };
  const text = reason.trim();
  if (!text) return { ok: false, error: "Say why it moved." };
  if (text.length > 500) return { ok: false, error: "Keep the reason to a line." };
  return { ok: true };
}

// The live (not archived) 1-1 sitting on a date, if there is one. A partial
// unique index allows only one, which is why a move onto an occupied date has
// to be refused rather than attempted.
//
// The occupancy read and the move itself moved to ./move-meeting when coaching
// gained a second mover (the `leave.approved` subscriber); re-exported here so
// the existing callers keep one import.
export { liveScheduledRowOn };

export async function coachMoveOneOnOne(
  actor: TeamActor,
  meetingId: string,
  newDateISO: string,
  reason: string,
): Promise<Result> {
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  const allowed = moveOutcome(owned.meeting, newDateISO, reason, saigonToday());
  if (!allowed.ok) return allowed;

  const occupied = await liveScheduledRowOn(owned.profileId, newDateISO);
  if (occupied && occupied.id !== meetingId)
    return { ok: false, error: "There is already a 1-1 on that day." };

  return applyMeetingMove({
    meetingId,
    from: owned.meeting.heldOn,
    to: newDateISO,
    reason,
  });
}

export async function coachArchiveMeeting(actor: TeamActor, meetingId: string): Promise<Result> {
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  return patchMeeting(meetingId, { archived_at: new Date().toISOString() });
}

// Mark a 1-1 held after the fact (K.36). One of the four ways out of the
// passed-unheld prompt: the meeting did happen, just not where the page could
// see it.
//
// marked_held_on records the day of this answer. When it is after the booked
// day the 1-1 was held late, which stays true and is what the member's History
// shows. It is written here, by the coach's own answer, and by no routine
// (A.31): a transcript arriving days later proves the meeting happened on its
// day, so the paths that mark a row held from a recording leave it alone.
export async function coachMarkOneOnOneHeld(actor: TeamActor, meetingId: string): Promise<Result> {
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  if (owned.meeting.status === "held") return { ok: true };
  if (owned.meeting.status === "skipped")
    return { ok: false, error: "A skipped 1-1 cannot be marked held. Book the next one." };
  return patchMeeting(meetingId, { status: "held", coach_voltage_md: null, marked_held_on: saigonToday() });
}

// The coach's voltage note (K.23): one private line before the meeting, theirs
// alone. It is cleared by every path that marks the row held, so nothing about
// the coach's state outlives the hour, and no member-tier read ever selects it.
export async function coachSaveVoltage(actor: TeamActor, meetingId: string, text: string): Promise<Result> {
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  if (owned.meeting.status === "held") return { ok: false, error: "That 1-1 has been held." };
  const line = text.trim();
  if (line.length > 200) return { ok: false, error: "Keep it to a line." };
  return patchMeeting(meetingId, { coach_voltage_md: line || null });
}
