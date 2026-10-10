import { companyOs } from "@/kernel/data/supabase";
import { mustRows, ReadFailure } from "@/kernel/data/read";
import { getLeaveSpans } from "./leave";
import { toHowIWork, type HowIWork } from "../how-i-work";
import { getNoticeableValues, getNoticedFor, type NoticedRow } from "./noticed";
import type { LeaveSpan } from "../leave-window";
import { saigonToday } from "@/kernel/config/dates";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { type RecapLanguage, type RetentionRoot, type OneOnOneStatus, type CoachingGoal, type EdgesOptions } from "../types";
import { GOAL_SELECT, OCEAN_SELECT, PRIORITY_SELECT, attachComments, getEdgesLadderOptions, getGoalComments, toGoal, toOcean, toPriority, type CoachingPriority, type OceanProfile } from "./goals";
import { COMMITMENT_SELECT, toCommitment, toMember, withHistoryCounts, type CoachingMember, type Commitment } from "./rows";
import { getCommitmentHistoryCounts } from "./commitments";
import { openProposal, shortTime } from "../cadence";
import { heldLate, meetingOutcome, type MeetingOutcome } from "../missed";
import { scheduleOf } from "../one-on-one-schedule";
import { normaliseEdits, type PrepEdits } from "../prep-edits";
import { assertCoachOwnsProfile, coachBoards, loadCommitmentCards, type CommitmentCard, type ModeSplit } from "./shared";

export type OneOnOne = {
  id: string;
  heldOn: string;
  status: OneOnOneStatus;
  // "HH:MM" Saigon, from the member's preference when the row was booked
  // (K.34); null on a meeting with a date only.
  startsAt: string | null;
  prepMarkdown: string | null;
  prepGeneratedAt: string | null;
  // What the member struck and added on the shared prep (K.21).
  prepMemberEdits: PrepEdits;
  transcript: string | null;
  summaryMarkdown: string | null;
  sharedSummaryMarkdown: string | null;
  sharedPublishedAt: string | null;
  modeSplit: ModeSplit | null;
  // Why the coach skipped this 1-1 (K.9); null on every other status.
  skipReason: string | null;
  // Where this 1-1 was before its last move, and the one line for why (K.33).
  // Both null on a 1-1 that was never moved.
  movedFrom: string | null;
  moveReason: string | null;
  // What became of this booking, and whether it happened on the day it was
  // booked. The day and the held-late stamp stop here: a screen that wants
  // either answer reads it off the row rather than deriving it itself.
  outcome: MeetingOutcome;
  heldLate: boolean;
  minutesToken: string | null;
  transcriptSource: "minutes_auto" | "minutes_link" | "manual" | null;
  aiModel: string | null;
  aiError: string | null;
  // The coach's private voltage note (K.23); coach tier only.
  coachVoltage: string | null;
  // "written" when the answers plus the reply counted as the 1-1 (K.35).
  heldSource: "meeting" | "written" | null;
  // How it happened, when the coach said (K.80): video, call, in_person, chat.
  format: string | null;
};

export const MEETING_SELECT =
  "id, coaching_profile_id, held_on, status, starts_at, prep_markdown, prep_generated_at, prep_member_edits, " +
  "summary_markdown, shared_summary_markdown, shared_published_at, skip_reason, moved_from, move_reason, marked_held_on, coach_voltage_md, held_source, format, " +
  "mode_coach_pct, mode_mentor_pct, mode_direct_pct, minutes_token, transcript_source, ai_model, ai_error, " +
  "meeting_id, linked_meeting:meetings!meeting_id(call_transcripts(transcript))";

// The transcript lives in call_transcripts on the linked meeting, and nowhere
// else: the coaching_one_on_ones.transcript mirror was backfilled onto the
// meetings and dropped in K.11.
function transcriptFrom(r: Record<string, unknown>): string | null {
  const lm = r.linked_meeting as
    | { call_transcripts?: { transcript: string | null }[] | { transcript: string | null } | null }
    | { call_transcripts?: unknown }[]
    | null;
  const meeting = Array.isArray(lm) ? lm[0] : lm;
  const ct = meeting?.call_transcripts as
    | { transcript: string | null }[]
    | { transcript: string | null }
    | null
    | undefined;
  return (Array.isArray(ct) ? ct[0]?.transcript : ct?.transcript) ?? null;
}

export function toOneOnOne(r: Record<string, unknown>, todayISO: string = saigonToday()): OneOnOne {
  // The only place in the read path that decides what became of the row.
  // Everything below the boundary gets the decided fact, which is what stops the
  // roster, the member's page and the coach's badge from each deriving it their
  // own way.
  const columns = {
    status: r.status as OneOnOneStatus,
    heldOn: r.held_on as string,
    markedHeldOn: (r.marked_held_on as string | null) ?? null,
  };
  return {
    id: r.id as string,
    heldOn: r.held_on as string,
    status: columns.status,
    startsAt: shortTime(r.starts_at as string | null),
    prepMarkdown: (r.prep_markdown as string | null) ?? null,
    prepGeneratedAt: (r.prep_generated_at as string | null) ?? null,
    prepMemberEdits: normaliseEdits(r.prep_member_edits),
    transcript: transcriptFrom(r),
    summaryMarkdown: (r.summary_markdown as string | null) ?? null,
    sharedSummaryMarkdown: (r.shared_summary_markdown as string | null) ?? null,
    sharedPublishedAt: (r.shared_published_at as string | null) ?? null,
    modeSplit:
      r.mode_coach_pct == null
        ? null
        : {
            coach: r.mode_coach_pct as number,
            mentor: r.mode_mentor_pct as number,
            direct: r.mode_direct_pct as number,
          },
    skipReason: (r.skip_reason as string | null) ?? null,
    movedFrom: (r.moved_from as string | null) ?? null,
    moveReason: (r.move_reason as string | null) ?? null,
    outcome: meetingOutcome(columns, todayISO),
    heldLate: heldLate(columns),
    minutesToken: (r.minutes_token as string | null) ?? null,
    transcriptSource: (r.transcript_source as "minutes_auto" | "minutes_link" | "manual" | null) ?? null,
    aiModel: (r.ai_model as string | null) ?? null,
    aiError: (r.ai_error as string | null) ?? null,
    coachVoltage: (r.coach_voltage_md as string | null) ?? null,
    heldSource: (r.held_source as "meeting" | "written" | null) ?? null,
    format: (r.format as string | null) ?? null,
  };
}

export type Checkin = {
  id: string;
  sentAt: string;
  // The retired mid-cycle essay. Null on every row written since K.15, which
  // carries the member's three pre-meeting answers instead.
  messageMarkdown: string | null;
  respondedAt: string | null;
  moved: string | null;
  stuck: string | null;
  talk: string | null;
  coachNote: string | null;
};

// Every column the two tiers read off a check-in row. One constant so the
// member's page and the coach's page can never drift apart on it.
export const CHECKIN_SELECT =
  "id, sent_at, message_markdown, responded_at, moved_md, stuck_md, talk_md, coach_note_md";

export function toCheckin(c: Record<string, unknown>): Checkin {
  return {
    id: c.id as string,
    sentAt: c.sent_at as string,
    messageMarkdown: (c.message_markdown as string | null) ?? null,
    respondedAt: (c.responded_at as string | null) ?? null,
    moved: (c.moved_md as string | null) ?? null,
    stuck: (c.stuck_md as string | null) ?? null,
    talk: (c.talk_md as string | null) ?? null,
    coachNote: (c.coach_note_md as string | null) ?? null,
  };
}

export type TrendReport = {
  id: string;
  period: string;
  reportMarkdown: string | null;
  aiError: string | null;
  createdAt: string;
};

// A talking point the member raises before a 1-1 (their half of the agenda).
export type TalkingPoint = {
  id: string;
  body: string;
  authorTeamMemberId: string | null;
  addressedAt: string | null;
  createdAt: string;
};

export const TALKING_POINT_SELECT = "id, body, author_team_member_id, addressed_at, created_at";

export function toTalkingPoint(r: Record<string, unknown>): TalkingPoint {
  return {
    id: r.id as string,
    body: r.body as string,
    authorTeamMemberId: (r.author_team_member_id as string | null) ?? null,
    addressedAt: (r.addressed_at as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

export type CoachProfileDetail = {
  profileId: string;
  member: CoachingMember;
  goals: CoachingGoal[];
  priorities: CoachingPriority[];
  ocean: OceanProfile | null;
  retentionRoot: RetentionRoot | null;
  // Null means the recap follows the transcript; set, it pins the shared tier.
  recapLanguage: RecapLanguage | null;
  edges: EdgesOptions;
  privateProfileMarkdown: string | null;
  // What the member wrote about how they work (L.3). Read here, never written.
  howIWork: HowIWork;
  // What has been noticed about this person's work (L.4), and the values a
  // new one may be tagged with. Never a count — the list or nothing.
  noticed: NoticedRow[];
  noticeableValues: { id: string; title: string }[];
  cadenceDays: number;
  // The next booked 1-1's day, and the day that would keep the rhythm when
  // nothing is booked, from the 1-1 schedule (ADR-0010).
  nextOneOnOneOn: string | null;
  suggestedOn: string | null;
  // A date the member proposed and the coach has not answered yet (K.32).
  proposedOn: string | null;
  // The time of day the member said suits them (K.34), "HH:MM".
  preferredTime: string | null;
  // Set while the coach has paused the 1-1 rhythm (no rolled dates, no preps).
  oneOnOnesPausedAt: string | null;
  meetings: OneOnOne[];
  commitments: Commitment[];
  talkingPoints: TalkingPoint[];
  checkins: Checkin[];
  trends: TrendReport[];
  // Boards the coach can push a commitment to, and any commitment already pushed.
  boards: { id: string; slug: string; name: string }[];
  commitmentCards: Record<string, CommitmentCard>;
  // When this member is away (L.2): so the coach never proposes a 1-1 into
  // their holiday, and a 1-1 missed over one is not called a missed 1-1.
  memberLeave: LeaveSpan[];
};

export async function getCoachProfileDetail(
  actor: TeamActor,
  profileId: string,
): Promise<CoachProfileDetail | null> {
  const p = await assertCoachOwnsProfile(actor, profileId);
  if (!p) return null;

  const [meetings, commitments, talkingPoints, checkins, trends, goals, priorities, ocean, edges] =
    await Promise.all([
    companyOs
      .from("coaching_one_on_ones")
      .select(MEETING_SELECT)
      .eq("coaching_profile_id", profileId)
      .is("archived_at", null)
      .order("held_on", { ascending: false }),
    companyOs
      .from("coaching_commitments")
      .select(COMMITMENT_SELECT)
      .eq("coaching_profile_id", profileId)
      .order("sort_order")
      .order("created_at", { ascending: false }),
    companyOs
      .from("coaching_talking_points")
      .select(TALKING_POINT_SELECT)
      .eq("coaching_profile_id", profileId)
      .is("addressed_at", null)
      .order("created_at", { ascending: true }),
    companyOs
      .from("coaching_checkins")
      .select(CHECKIN_SELECT)
      .eq("coaching_profile_id", profileId)
      .order("sent_at", { ascending: false }),
    companyOs
      .from("coaching_trends")
      .select("id, period, report_markdown, ai_error, created_at")
      .eq("coaching_profile_id", profileId)
      .order("period", { ascending: false }),
    companyOs
      .from("goals")
      .select(GOAL_SELECT)
      .eq("coaching_profile_id", profileId)
      .order("created_at"),
    companyOs
      .from("coaching_priorities")
      .select(PRIORITY_SELECT)
      .eq("coaching_profile_id", profileId)
      .order("sort_order")
      .order("created_at"),
    companyOs
      .from("coaching_ocean_profiles")
      .select(OCEAN_SELECT)
      .eq("coaching_profile_id", profileId)
      .maybeSingle(),
    getEdgesLadderOptions(),
  ]);

  // Every read below raises on failure (rule 2): a failed read rendered as an
  // empty list turned a coachee with goals, promises and a history into the
  // "you two have not met yet" first-visit page (K.79). Only OCEAN, a
  // maybeSingle, is checked by hand.
  if (ocean.error) throw new ReadFailure("[coaching/profile] coaching_ocean_profiles", ocean.error.message);
  const goalRows = (mustRows(goals, "[coaching/profile] goals") as unknown as Record<string, unknown>[]).map((g) => toGoal(g, edges));
  const goalComments = await getGoalComments(goalRows.map((g) => g.id));

  const commitmentList = (mustRows(commitments, "[coaching/profile] coaching_commitments") as unknown as Record<string, unknown>[]).map(toCommitment);
  // toMember resolves the coached person from the same row the guard loaded, so
  // the leave read is scoped to this profile's member and needs no second lookup.
  const member = toMember(p);
  const [boards, commitmentCards, historyCounts, memberLeave, noticed, noticeableValues] = await Promise.all([
    coachBoards(actor),
    loadCommitmentCards(commitmentList.map((c) => c.id)),
    getCommitmentHistoryCounts(commitmentList.map((c) => c.id)),
    getLeaveSpans(member.teamMemberId, saigonToday()),
    getNoticedFor(profileId),
    getNoticeableValues(),
  ]);

  // The page already holds every live 1-1 and the member's leave, so it asks
  // the schedule's pure core directly instead of reading them a second time. A
  // failed read raises: "Nothing booked" beside the booking form would invite a
  // second booking for a pair that already has one.
  const today = saigonToday();
  const meetingRows = (mustRows(meetings, "[coaching/profile] coaching_one_on_ones") as unknown as Record<string, unknown>[]).map(
    (r) => toOneOnOne(r, today),
  );
  const schedule = scheduleOf({
    rows: meetingRows.map((m) => ({ id: m.id, day: m.heldOn, status: m.status, movedFrom: m.movedFrom })),
    cadenceDays: (p.cadence_days as number | null) ?? null,
    leave: memberLeave,
    today,
    paused: Boolean(p.one_on_ones_paused_at),
  });

  return {
    profileId,
    member,
    boards,
    commitmentCards,
    memberLeave,
    noticed,
    noticeableValues,
    goals: attachComments(goalRows, goalComments),
    priorities: (mustRows(priorities, "[coaching/profile] coaching_priorities") as unknown as Record<string, unknown>[]).map((x) => toPriority(x, edges)),
    ocean: ocean.data ? toOcean(ocean.data as unknown as Record<string, unknown>) : null,
    retentionRoot: (p.retention_root as RetentionRoot | null) ?? null,
    recapLanguage: (p.recap_language as RecapLanguage | null) ?? null,
    edges,
    privateProfileMarkdown: (p.private_profile_markdown as string | null) ?? null,
    howIWork: toHowIWork(p),
    cadenceDays: (p.cadence_days as number) ?? 14,
    nextOneOnOneOn: schedule.booked?.day ?? null,
    suggestedOn: schedule.suggested,
    proposedOn: openProposal(p.proposed_one_on_one_on as string | null, today),
    preferredTime: shortTime(p.preferred_time as string | null),
    oneOnOnesPausedAt: (p.one_on_ones_paused_at as string | null) ?? null,
    meetings: meetingRows,
    commitments: withHistoryCounts(commitmentList, historyCounts),
    talkingPoints: (mustRows(talkingPoints, "[coaching/profile] coaching_talking_points") as unknown as Record<string, unknown>[]).map(toTalkingPoint),
    checkins: (mustRows(checkins, "[coaching/profile] coaching_checkins") as unknown as Array<Record<string, unknown>>).map(toCheckin),
    trends: (mustRows(trends, "[coaching/profile] coaching_trends") as unknown as Record<string, unknown>[]).map((t) => ({
      id: t.id as string,
      period: t.period as string,
      reportMarkdown: (t.report_markdown as string | null) ?? null,
      aiError: (t.ai_error as string | null) ?? null,
      createdAt: t.created_at as string,
    })),
  };
}
