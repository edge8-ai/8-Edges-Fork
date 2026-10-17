"use server";

import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { assertCoachOwnsMeeting, coachMarkOneOnOneHeld, coachMoveOneOnOne, coachSaveVoltage } from "./data/one-on-ones";
import { coachConfirmProposedDate, coachDeclineProposedDate } from "./data/proposals";
import { coachHoldInWriting } from "./data/written";
import { coachSetOneOnOneTime } from "./data/one-on-one-time";
import type { Result } from "@/kernel/data/result";

import { parseInput, zDay, zId, zLooseText, zTime } from "./schemas";
import { z } from "zod";
import { refreshCoachAndMember, refreshCoaching } from "./revalidate";

// What a scheduling action accepts (ticket 13).
const S = {
  profile: z.object({ profileId: zId }),
  meeting: z.object({ meetingId: zId }),
  move: z.object({ meetingId: zId, newDate: zDay, reason: zLooseText(1_000), time: zTime }),
  time: z.object({ meetingId: zId, time: zTime }),
  voltage: z.object({ meetingId: zId, text: zLooseText(5_000) }),
};

// The coach's scheduling actions (K.32, K.33, K.36): confirm or decline a date
// the member proposed, move a 1-1, mark a missed one held. Split out of
// actions.ts for the file-size cap. Every one starts with the guard and
// re-derives ownership server-side, like the rest of the coach tier. Both the
// coach's profile page and the member's My Coach show the date, so both are
// refreshed.


// The coach's one click on a date the member proposed (K.32): confirm books it
// (or moves the booked 1-1 there), decline clears the proposal and leaves
// whatever is booked standing.
export async function confirmProposedDate(profileId: string): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.profile, { profileId });
  if (!p.ok) return p;
  const res = await coachConfirmProposedDate(actor, p.data.profileId);
  if (res.ok) refreshCoachAndMember(profileId);
  return res;
}

export async function declineProposedDate(profileId: string): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.profile, { profileId });
  if (!p.ok) return p;
  const res = await coachDeclineProposedDate(actor, p.data.profileId);
  if (res.ok) refreshCoachAndMember(profileId);
  return res;
}

// Move a 1-1 rather than skip it (K.33). Both the coach's profile page and
// the member's My Coach show the date, so both are refreshed.
//
// The form carries the booking's current time, so whatever comes back is what
// the coach means it to be and is written as given — clearing the field takes
// the time off. The time is a second write rather than part of the move
// because `coachSetOneOnOneTime` is the one writer of starts_at (K.71); a move
// whose time write fails leaves the meeting on its new day without one, which
// is a state the roster already has a sentence for.
export async function moveOneOnOne(
  meetingId: string,
  newDate: string,
  reason: string,
  time: string | null,
): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.move, { meetingId, newDate, reason, time });
  if (!p.ok) return p;
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  const res = await coachMoveOneOnOne(actor, meetingId, newDate, reason);
  if (!res.ok) return res;
  const timed = await coachSetOneOnOneTime(actor, meetingId, p.data.time);
  refreshCoachAndMember(owned.profileId);
  // The day has already changed by here, so a failure on the second write is
  // not "the move failed" and must not read as it: the coach would try again
  // and be told the 1-1 is already on that day. Naming what did land, and
  // where to finish it, is the only honest answer.
  if (!timed.ok) return { ok: false, error: "It moved, but the time did not save. Set it from the row." };
  return { ok: true };
}

// Put a time on a booking, or take it off, without moving it (K.71). This is
// what the roster's "has no time on it" line is answered with, and it asks for
// no reason: the day is not changing, so there is nothing for the member to be
// told about beyond the time itself, which they can see.
export async function setOneOnOneTime(meetingId: string, time: string | null): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.time, { meetingId, time });
  if (!p.ok) return p;
  const owned = await assertCoachOwnsMeeting(actor, p.data.meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  const res = await coachSetOneOnOneTime(actor, p.data.meetingId, p.data.time);
  if (res.ok) refreshCoachAndMember(owned.profileId);
  return res;
}

// Mark a missed 1-1 as held after the fact (K.36): the meeting happened, the
// cron just never saw it. The member's page reads the same row, so both are
// refreshed.
export async function markOneOnOneHeld(meetingId: string): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.meeting, { meetingId });
  if (!p.ok) return p;
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  const res = await coachMarkOneOnOneHeld(actor, meetingId);
  if (res.ok) refreshCoachAndMember(owned.profileId);
  return res;
}


// The coach's voltage note (K.23). Only the coach's page shows it, so only
// that page is refreshed.
export async function saveVoltageNote(meetingId: string, text: string): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.voltage, { meetingId, text });
  if (!p.ok) return p;
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  const res = await coachSaveVoltage(actor, meetingId, text);
  if (res.ok) refreshCoaching({ profileId: owned.profileId });
  return res;
}

// Hold a 1-1 in writing (K.35): the answers plus the reply count as the
// meeting. Both pages show the row and the next date, so both are refreshed.
export async function holdOneOnOneInWriting(meetingId: string): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.meeting, { meetingId });
  if (!p.ok) return p;
  const owned = await assertCoachOwnsMeeting(actor, p.data.meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  const res = await coachHoldInWriting(actor, meetingId);
  if (res.ok) refreshCoachAndMember(owned.profileId);
  return res;
}
