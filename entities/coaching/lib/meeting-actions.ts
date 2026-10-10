"use server";

import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import {
  assertCoachOwnsMeeting,
  coachArchiveMeeting,
  coachCreateOneOnOne,
  coachSaveTranscript,
  coachSkipOneOnOne,
} from "./data/one-on-ones";
import { coachPublishSharedRecap, coachSaveSummaries } from "./data/recap-publish";
import { assertCoachOwnsProfile } from "./data/shared";
import { generatePrep, summarizeMeeting } from "./ai";
import { parseInput, zDay, zId, zMarkdown, zLooseText, zTime } from "./schemas";
import { z } from "zod";
import type { Result } from "@/kernel/data/result";
import { refreshCoachAndDirectory, refreshCoachAndMember } from "./revalidate";
import { coachCompleteSession, type SessionDoneInput } from "./data/session-done";
import { SESSION_FORMATS } from "./session-done";

// The shapes this file accepts. A transcript and a recap are the only things
// here that are genuinely long, so they get the markdown cap rather than a
// prose one; everything else is an id, a day or a boolean.
const S = {
  schedule: z.object({ profileId: zId, date: zDay, time: zTime }),
  transcript: z.object({ meetingId: zId, transcript: zMarkdown }),
  skip: z.object({ meetingId: zId, reason: zLooseText(1_000) }),
  meeting: z.object({ meetingId: zId }),
  summaries: z.object({ meetingId: zId, summaryMarkdown: zMarkdown, sharedSummaryMarkdown: zMarkdown }),
  publish: z.object({ meetingId: zId, publish: z.boolean() }),
  done: z.object({
    profileId: zId,
    day: zDay,
    which: z.enum(["booked", "extra"]),
    note: zLooseText(4_000),
    privateNote: zLooseText(4_000),
    format: z.enum(SESSION_FORMATS).nullable(),
    steps: z.array(z.object({ title: zLooseText(500), owner: z.enum(["coach", "member"]) })).max(10),
    minutesUrl: zLooseText(2_000),
    transcript: zMarkdown,
  }),
};

// The coach's actions about MEETINGS: booking one, logging one that already
// happened, the transcript, the two summaries, publishing the shared recap,
// skipping and archiving.
//
// Split out of actions.ts (ticket 13), which had grown to thirty-two actions
// across seven concerns in under four hundred lines and could not take the
// input parsing without breaking the file-size cap. Meetings and commitments
// were the two coherent halves; what stayed is the person and their record.
//
// Same discipline as before: requireTeamMember() first — check-action-auth
// enforces that — then the parse, then a data helper that re-derives coach
// ownership server-side, so a forged id belonging to someone else's report is
// a no-op rather than a leak. The AI calls additionally assert ownership HERE
// before invoking the generator, because the generators are authorization-free
// (the cron calls them too).


// Book the next 1-1 (a scheduled row + the profile's next date). An empty time
// is not "no time": it means the coach did not override the member's standing
// preference, which is the common case and the one the form defaults to.
export async function scheduleOneOnOne(profileId: string, date: string, time: string | null): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.schedule, { profileId, date, time });
  if (!p.ok) return p;
  const res = await coachCreateOneOnOne(actor, p.data.profileId, p.data.date, "scheduled", p.data.time);
  if (res.ok) refreshCoachAndDirectory(profileId);
  return res.ok ? { ok: true } : res;
}

export async function saveTranscript(meetingId: string, transcript: string): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.transcript, { meetingId, transcript });
  if (!p.ok) return p;
  const res = await coachSaveTranscript(actor, p.data.meetingId, p.data.transcript);
  if (!res.ok) return res;
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  await summarizeMeeting(meetingId);
  refreshCoachAndDirectory(owned?.profileId);
  return { ok: true };
}

// Skip a 1-1 with a reason; the cadence rolls forward behind it (K.9).
export async function skipOneOnOne(meetingId: string, reason: string): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.skip, { meetingId, reason });
  if (!p.ok) return p;
  const owned = await assertCoachOwnsMeeting(actor, p.data.meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  const res = await coachSkipOneOnOne(actor, p.data.meetingId, p.data.reason);
  if (res.ok) refreshCoachAndDirectory(owned.profileId);
  return res;
}

export async function generatePrepAction(meetingId: string): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.meeting, { meetingId });
  if (!p.ok) return p;
  const owned = await assertCoachOwnsMeeting(actor, p.data.meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  const res = await generatePrep(p.data.meetingId);
  refreshCoachAndDirectory(owned.profileId);
  return res;
}

export async function summarizeAction(meetingId: string): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.meeting, { meetingId });
  if (!p.ok) return p;
  const owned = await assertCoachOwnsMeeting(actor, p.data.meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  const res = await summarizeMeeting(p.data.meetingId);
  refreshCoachAndDirectory(owned.profileId);
  return res;
}

export async function saveSummaries(
  meetingId: string,
  summaryMarkdown: string,
  sharedSummaryMarkdown: string,
): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.summaries, { meetingId, summaryMarkdown, sharedSummaryMarkdown });
  if (!p.ok) return p;
  const res = await coachSaveSummaries(
    actor,
    p.data.meetingId,
    p.data.summaryMarkdown,
    p.data.sharedSummaryMarkdown,
  );
  if (res.ok) {
    const owned = await assertCoachOwnsMeeting(actor, meetingId);
    refreshCoachAndDirectory(owned?.profileId);
  }
  return res;
}

export async function publishRecap(meetingId: string, publish: boolean): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.publish, { meetingId, publish });
  if (!p.ok) return p;
  const res = await coachPublishSharedRecap(actor, p.data.meetingId, p.data.publish);
  if (res.ok) {
    const owned = await assertCoachOwnsMeeting(actor, meetingId);
    refreshCoachAndDirectory(owned?.profileId);
  }
  return res;
}

export async function archiveMeeting(meetingId: string): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.meeting, { meetingId });
  if (!p.ok) return p;
  const owned = await assertCoachOwnsMeeting(actor, p.data.meetingId);
  const res = await coachArchiveMeeting(actor, p.data.meetingId);
  if (res.ok) refreshCoachAndDirectory(owned?.profileId);
  return res;
}

// Mark a coaching session done (K.80): whenever the coach likes, however the
// two of them met, booked or not. An optional note becomes the shared recap;
// the employee is asked for their own FAST goal update or reflection. Both
// sides show the session, so both are refreshed.
export async function completeSession(profileId: string, input: SessionDoneInput): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.done, { profileId, ...input });
  if (!p.ok) return p;
  const { profileId: id, ...done } = p.data;
  // A pasted transcript is summarized before the coach's own words are laid
  // over it, so an AI draft never replaces what the coach wrote.
  const res = await coachCompleteSession(actor, id, done, summarizeMeeting);
  if (res.ok) refreshCoachAndMember(id);
  return res;
}
