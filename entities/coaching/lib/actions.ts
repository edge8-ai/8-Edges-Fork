"use server";

import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
// The actions import the module's concrete data files, never the module index:
// this module's client components import these actions, so going through the
// index would close an index -> ui -> actions -> index cycle.
import {
  coachAddPriority,
  coachPublishOcean,
  coachSaveOcean,
  coachSetCadence,
  coachSetRecapLanguage,
  coachSetOneOnOnesPaused,
  coachSetMinutesLink,
  coachSetPrivateProfile,
  coachSetRetentionRoot,
  coachUpdatePriority,
  type OceanInput,
} from "./data/coach-edits";
import {
  coachReorderCommitments,
  coachAddCommitment,
  coachPushCommitmentToBoard,
  coachUpdateCommitment,
} from "./data/commitments";
import { coachDismissCardDone } from "./data/commitment-owner-writes";
import { coachAddNoticed } from "./data/noticed";
import {
  assertCoachOwnsMeeting,
  coachArchiveMeeting,
  coachCreateOneOnOne,
  coachSaveTranscript,
  coachSkipOneOnOne,
} from "./data/one-on-ones";
import { coachPublishSharedRecap, coachSaveSummaries } from "./data/recap-publish";
import { coachAddToRoster } from "./data/roster";
import { assertCoachOwnsProfile } from "./data/shared";
import { coachAddTalkingPoint, coachDeleteTalkingPoint, setTalkingPointAddressed } from "./data/talking-points";
import type {
  CommitmentOwner,
  CommitmentStatus,
  GoalStatus,
  LadderInput,
  PriorityStatus,
  RecapLanguage,
  RetentionRoot,
} from "./types";
import { generatePrep, generateTrendReport, summarizeMeeting } from "./ai";
import { notifyBoardAssignee } from "@/entities/boards";
import type { Result } from "@/kernel/data/result";
import { parseInput, zId, zLooseText, zMarkdown, zText } from "./schemas";
import { z } from "zod";
import { OCEAN_DIMENSIONS } from "./types";
import { refreshCoachAndDirectory, refreshMember } from "./revalidate";

// The shapes this file accepts (ticket 13). The two structured inputs — the
// ladder and the OCEAN read — are the reason these are objects rather than
// inline checks: both arrive from the client as nested shapes, and a nested
// shape is exactly what nothing was checking.
const zLadder = z.union([
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.enum(["objective", "key_result"]), id: zId }),
]);

const S = {
  id: z.object({ id: zId }),
  profile: z.object({ profileId: zId }),
  talkingPoint: z.object({ profileId: zId, body: zText(2_000, "Write the talking point first.") }),
  addToRoster: z.object({ teamMemberId: zId }),
  addPriority: z.object({
    profileId: zId,
    title: zText(300, "The priority needs a title."),
    detail: zLooseText(5_000),
    ladder: zLadder,
  }),
  updatePriority: z.object({
    profileId: zId,
    priorityId: zId,
    patch: z.object({
      title: zText(300, "The priority needs a title.").optional(),
      detail: zLooseText(5_000).optional(),
      status: z.enum(["active", "retired"]).optional(),
      ladder: zLadder.optional(),
      // The URL is checked again by normalisePriorityLink, which owns the
      // scheme allowlist; this only says the shape arrived intact.
      link: z.object({ url: zLooseText(2_000), title: zLooseText(300) }).nullable().optional(),
    }),
  }),
  saveOcean: z.object({
    profileId: zId,
    input: z.object({
      dims: z.record(z.enum(OCEAN_DIMENSIONS), z.object({ rating: zLooseText(100), evidence: zLooseText(5_000) })),
      snapshot: zLooseText(10_000),
      guidance: zLooseText(10_000),
    }),
  }),
  publish: z.object({ profileId: zId, publish: z.boolean() }),
  retention: z.object({
    profileId: zId,
    root: z.enum(["belonging", "links", "sacrifice", "watching"]).nullable(),
  }),
  minutes: z.object({ meetingId: zId, url: zLooseText(2_000) }),
  cadence: z.object({
    profileId: zId,
    // A cadence of zero would divide by nothing downstream and a year is not a
    // cadence; the roster's copy assumes a number of days somebody recognises.
    cadenceDays: z.number().int().min(1, "A cadence is at least a day.").max(365, "Keep the cadence under a year."),
  }),
  recapLanguage: z.object({ profileId: zId, language: z.enum(["vi", "en"]).nullable() }),
  paused: z.object({ profileId: zId, paused: z.boolean() }),
  privateProfile: z.object({ profileId: zId, markdown: zMarkdown }),
  noticed: z.object({
    profileId: zId,
    input: z.object({
      body: zText(300, "Write the sentence first."),
      valueId: zId.nullable(),
      subject: zLooseText(300).nullable(),
    }),
  }),
};

// Coach-side actions for /team/coaching. Same discipline as the onboarding
// actions: requireTeamMember() plus ownership assertions in lib/coaching/data
// — every helper re-derives coach ownership server-side, so a client-forged
// profile/meeting/commitment id belonging to someone else's report is a no-op.
// The AI calls (prep, summarize, trend) additionally assert ownership HERE
// before invoking the generator, because the generators themselves are
// authorization-free (the cron calls them too).


// Mark a talking point the member raised as addressed (it drops off both pages).
export async function resolveTalkingPoint(id: string): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.id, { id });
  if (!p.ok) return p;
  const res = await setTalkingPointAddressed(actor, p.data.id, true);
  if (res.ok) refreshCoachAndDirectory(res.profileId);
  return res.ok ? { ok: true } : res;
}

// The coach's half of the shared agenda: add a talking point to a coachee's
// list, or remove one. The member's page renders the same list.
export async function addTalkingPoint(profileId: string, body: string): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.talkingPoint, { profileId, body });
  if (!p.ok) return p;
  const res = await coachAddTalkingPoint(actor, p.data.profileId, p.data.body);
  if (res.ok) {
    refreshCoachAndDirectory(profileId);
    refreshMember();
  }
  return res;
}

export async function deleteTalkingPoint(id: string): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.id, { id });
  if (!p.ok) return p;
  const res = await coachDeleteTalkingPoint(actor, p.data.id);
  if (res.ok) {
    refreshCoachAndDirectory(res.profileId);
    refreshMember();
  }
  return res.ok ? { ok: true } : res;
}

export async function addToRoster(teamMemberId: string): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.addToRoster, { teamMemberId });
  if (!p.ok) return p;
  const res = await coachAddToRoster(actor, p.data.teamMemberId);
  if (res.ok) refreshCoachAndDirectory();
  return res;
}

export async function addPriority(
  profileId: string,
  title: string,
  detail: string,
  ladder: LadderInput,
): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.addPriority, { profileId, title, detail, ladder });
  if (!p.ok) return p;
  const res = await coachAddPriority(actor, p.data.profileId, p.data);
  if (res.ok) refreshCoachAndDirectory(profileId);
  return res;
}

export async function updatePriority(
  profileId: string,
  priorityId: string,
  patch: {
    title?: string;
    detail?: string;
    status?: PriorityStatus;
    ladder?: LadderInput;
    // One thing to read or do about this priority (L.6); null clears it.
    link?: { url: string; title: string } | null;
  },
): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.updatePriority, { profileId, priorityId, patch });
  if (!p.ok) return p;
  const res = await coachUpdatePriority(actor, p.data.priorityId, p.data.patch);
  if (res.ok) refreshCoachAndDirectory(profileId);
  return res;
}

export async function saveOcean(profileId: string, input: OceanInput): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.saveOcean, { profileId, input });
  if (!p.ok) return p;
  const res = await coachSaveOcean(actor, p.data.profileId, p.data.input as OceanInput);
  if (res.ok) refreshCoachAndDirectory(profileId);
  return res;
}

export async function publishOcean(profileId: string, publish: boolean): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.publish, { profileId, publish });
  if (!p.ok) return p;
  const res = await coachPublishOcean(actor, p.data.profileId, p.data.publish);
  if (res.ok) refreshCoachAndDirectory(profileId);
  return res;
}

export async function setRetentionRoot(profileId: string, root: RetentionRoot | null): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.retention, { profileId, root });
  if (!p.ok) return p;
  const res = await coachSetRetentionRoot(actor, p.data.profileId, p.data.root);
  if (res.ok) refreshCoachAndDirectory(profileId);
  return res;
}

export async function setMinutesLink(meetingId: string, url: string): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.minutes, { meetingId, url });
  if (!p.ok) return p;
  const res = await coachSetMinutesLink(actor, p.data.meetingId, p.data.url);
  if (res.ok) {
    const owned = await assertCoachOwnsMeeting(actor, meetingId);
    refreshCoachAndDirectory(owned?.profileId);
  }
  return res;
}

// The cadence only: a day is booked through the schedule form, never typed onto
// the profile (ADR-0010).
export async function setCadence(profileId: string, cadenceDays: number): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.cadence, { profileId, cadenceDays });
  if (!p.ok) return p;
  const res = await coachSetCadence(actor, p.data.profileId, p.data.cadenceDays);
  if (res.ok) refreshCoachAndDirectory(profileId);
  return res;
}

export async function setRecapLanguage(
  profileId: string,
  language: RecapLanguage | null,
): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.recapLanguage, { profileId, language });
  if (!p.ok) return p;
  const res = await coachSetRecapLanguage(actor, p.data.profileId, p.data.language);
  if (res.ok) refreshCoachAndDirectory(profileId);
  return res;
}

export async function setOneOnOnesPaused(profileId: string, paused: boolean): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.paused, { profileId, paused });
  if (!p.ok) return p;
  const res = await coachSetOneOnOnesPaused(actor, p.data.profileId, p.data.paused);
  if (res.ok) refreshCoachAndDirectory(profileId);
  return res;
}

export async function savePrivateProfile(profileId: string, markdown: string): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.privateProfile, { profileId, markdown });
  if (!p.ok) return p;
  const res = await coachSetPrivateProfile(actor, p.data.profileId, p.data.markdown);
  if (res.ok) refreshCoachAndDirectory(profileId);
  return res;
}

// "Noticed" — a coach writes one sentence about a piece of work (L.4).
// It reaches exactly one person: the one it is about.
export async function noticeSomething(
  profileId: string,
  input: { body: string; valueId: string | null; subject: string | null },
): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.noticed, { profileId, input });
  if (!p.ok) return p;
  const res = await coachAddNoticed(actor, p.data.profileId, p.data.input);
  if (res.ok) refreshCoachAndDirectory(profileId);
  return res;
}

// Run (or re-run) the trend report for a month, e.g. "2026-07".
export async function runTrendReport(profileId: string): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.profile, { profileId });
  if (!p.ok) return p;
  if (!(await assertCoachOwnsProfile(actor, p.data.profileId))) return { ok: false, error: "Not found." };
  const res = await generateTrendReport(p.data.profileId);
  refreshCoachAndDirectory(profileId);
  return res;
}
