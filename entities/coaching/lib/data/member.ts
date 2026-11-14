import { companyOs } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { one } from "@/kernel/config/embedded";
import { COMMITMENT_STATUS_LABELS, buildPreMeeting, type GoalStatus, type CommitmentStatus, type GoalComment, type CoachingGoal, type PreMeeting } from "../types";
import { getCommitmentHistoryCounts, nextCommitmentSort, recordCommitmentChange } from "./commitments";
import { ladderValue } from "../ladder";
import { meetingStartsAt, openProposal, shortTime } from "../cadence";
import { normaliseEdits, type PrepEdits } from "../prep-edits";
import { GOAL_SELECT, OCEAN_SELECT, PRIORITY_SELECT, attachComments, getEdgesLadderOptions, getGoalComments, toGoal, toOcean, toPriority, type CoachingPriority, type OceanProfile } from "./goals";
import { CHECKIN_SELECT, TALKING_POINT_SELECT, toCheckin, toTalkingPoint, type Checkin, type TalkingPoint } from "./profile";
import { COMMITMENT_SELECT, toCommitment, withHistoryCounts, type Commitment, type PersonEmbed } from "./rows";
import { getCoachingProfileIdForMember, type Result } from "./shared";
import { getLeaveSpans } from "./leave";
import type { LeaveSpan } from "../leave-window";
import { toHowIWork, type HowIWork } from "../how-i-work";
import { saigonToday } from "@/kernel/config/dates";
import { NAME_COLUMNS, personName } from "@/kernel/config/people-name";
import { loadSchedules } from "./one-on-one-schedule";

export type MemberRecap = {
  id: string;
  heldOn: string;
  sharedSummaryMarkdown: string;
  sharedPublishedAt: string;
  // The member's agenda going into THIS 1-1: talking points that existed and
  // were still open when the meeting was held. Reconstructed from
  // created_at/addressed_at, so a point carried across meetings appears under
  // each meeting it was open for.
  agenda: string[];
};

export type MyCoaching = {
  profileId: string;
  // Null when nobody coaches this profile yet (a profile can exist for its
  // owner's FAST goals alone).
  coachName: string | null;
  goals: CoachingGoal[];
  priorities: CoachingPriority[];
  // The member's own OCEAN profile — present ONLY when the coach published it.
  ocean: OceanProfile | null;
  cadenceDays: number;
  // The next booked 1-1's day, from the 1-1 schedule; null when nothing is
  // booked (ADR-0010).
  nextOneOnOneOn: string | null;
  // The day that would keep the rhythm when nothing is booked; null while a
  // 1-1 is booked or waiting on an answer, and for someone never met.
  suggestedOn: string | null;
  // Whether this member has had a 1-1 (held or skipped). Someone who has not
  // books their first day directly; after that a day they name is a proposal
  // their coach confirms (K.32, A.31).
  hasMet: boolean;
  // The next meeting's start time, "HH:MM" Saigon, from the booked row or
  // the preference when the row carries none (K.34).
  nextStartsAt: string | null;
  preferredTime: string | null;
  // A date this member proposed that their coach has not answered yet (K.32).
  proposedOn: string | null;
  // The day of a 1-1 that was booked and did not happen (K.36); null when the
  // next 1-1 is still ahead. It is a prompt on the page, never a count.
  missedOn: string | null;
  // The member's copy of the ten-bullet prep for the upcoming 1-1: the coach's
  // list minus the coach-only bullets, member-visible by construction (K.4).
  nextPrepMarkdown: string | null;
  // The member's own strikes and additions to that prep (K.21).
  nextPrepEdits: PrepEdits;
  commitments: Commitment[];
  talkingPoints: TalkingPoint[];
  recaps: MemberRecap[];
  checkins: Checkin[];
  preMeeting: PreMeeting;
  // When the coach is away, so a date this member proposes lands on a day the
  // coach can actually make (L.2).
  // The member's own account of how they work (L.3).
  howIWork: HowIWork;
  coachLeave: LeaveSpan[];
  // When this member is away, so a 1-1 missed over their own holiday is not
  // called a missed 1-1 (L.2).
  myLeave: LeaveSpan[];
};

export async function getMyCoaching(actor: TeamActor): Promise<MyCoaching | null> {
  const { data, error: dataError } = await companyOs
    .from("coaching_profiles")
    .select("id, coach_id, cadence_days, one_on_ones_paused_at, preferred_time, proposed_one_on_one_on, how_best_hours_md, how_feedback_md, how_quiet_md, how_curious_md")
    .eq("team_member_id", actor.teamMemberId)
    .eq("active", true)
    .maybeSingle();
  if (dataError) console.error("[team/coaching/member] coaching_profiles", dataError);
  if (!data) return null;
  const p = data as unknown as Record<string, unknown>;
  const profileId = p.id as string;

  // Coach display name via forward lookup (never the self-FK reverse embed).
  // coach_id is nullable: a profile can exist for its FAST goals alone, before
  // anyone coaches it. No coach means no name to resolve, not a failed query.
  const coachId = (p.coach_id as string | null) ?? null;
  const { data: coachRow } = coachId
    ? await companyOs
        .from("team_members")
        .select(`people:people!person_id(${NAME_COLUMNS})`)
        .eq("id", coachId)
        .maybeSingle()
    : { data: null };
  const coachPerson = one(
    ((coachRow as unknown as Record<string, unknown> | null)?.people ?? null) as
      | PersonEmbed
      | PersonEmbed[]
      | null,
  );

  // The next booking, the one waiting on an answer and the suggested day, from
  // the one place every page asks (ADR-0010). Read before the rest because the
  // prep below belongs to the booking it names.
  const today = saigonToday();
  const schedule = (
    await loadSchedules(
      [
        {
          id: profileId,
          teamMemberId: actor.teamMemberId,
          cadenceDays: (p.cadence_days as number | null) ?? null,
          paused: Boolean(p.one_on_ones_paused_at),
        },
      ],
      today,
    )
  ).get(profileId);
  const booked = schedule?.booked ?? null;
  const nextOn = booked?.day ?? null;
  const [recaps, commitments, talkingPoints, checkins, goals, priorities, ocean, edges, nextPrep, lastHeld] = await Promise.all([
    companyOs
      .from("coaching_one_on_ones")
      .select("id, held_on, shared_summary_markdown, shared_published_at")
      .eq("coaching_profile_id", profileId)
      .is("archived_at", null)
      .not("shared_published_at", "is", null)
      .order("held_on", { ascending: false }),
    companyOs
      .from("coaching_commitments")
      .select(COMMITMENT_SELECT)
      .eq("coaching_profile_id", profileId)
      .order("sort_order")
      .order("created_at", { ascending: false }),
    // All points, addressed included: the open ones are the live agenda, and
    // the full set reconstructs each past meeting's agenda for the History tab.
    companyOs
      .from("coaching_talking_points")
      .select(TALKING_POINT_SELECT)
      .eq("coaching_profile_id", profileId)
      .order("created_at", { ascending: true }),
    companyOs
      .from("coaching_checkins")
      .select(CHECKIN_SELECT)
      .eq("coaching_profile_id", profileId)
      .order("sent_at", { ascending: false }),
    companyOs
      .from("goals")
      .select(GOAL_SELECT)
      .eq("coaching_profile_id", profileId)
      .in("status", ["draft", "active", "achieved"])
      .order("created_at"),
    companyOs
      .from("coaching_priorities")
      .select(PRIORITY_SELECT)
      .eq("coaching_profile_id", profileId)
      .eq("status", "active")
      .order("sort_order"),
    // Member tier: the published gate lives IN the query, not in the view.
    companyOs
      .from("coaching_ocean_profiles")
      .select(OCEAN_SELECT)
      .eq("coaching_profile_id", profileId)
      .eq("published", true)
      .maybeSingle(),
    getEdgesLadderOptions(),
    // prep_shared_markdown only: prep_markdown is coach-tier and never selected here.
    booked
      ? companyOs
          .from("coaching_one_on_ones")
          .select("prep_shared_markdown, prep_member_edits")
          .eq("id", booked.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    // The last held or skipped 1-1 opens the cycle the pre-meeting form belongs
    // to: a skip used up its cycle as surely as a held 1-1 did. Only one whose
    // day has come: a 1-1 skipped in advance does not open a cycle yet.
    companyOs
      .from("coaching_one_on_ones")
      .select("held_on")
      .eq("coaching_profile_id", profileId)
      .in("status", ["held", "skipped"])
      .lte("held_on", today)
      .is("archived_at", null)
      .order("held_on", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (nextPrep.error) console.error("[team/coaching/member] coaching_one_on_ones prep", nextPrep.error);
  if (checkins.error) console.error("[team/coaching/member] coaching_checkins", checkins.error);
  if (lastHeld.error) console.error("[team/coaching/member] coaching_one_on_ones held", lastHeld.error);

  const commitmentList = ((commitments.data ?? []) as unknown as Record<string, unknown>[]).map(toCommitment);
  const historyCounts = await getCommitmentHistoryCounts(commitmentList.map((c) => c.id));

  const myGoalRows = ((goals.data ?? []) as unknown as Record<string, unknown>[]).map((g) => toGoal(g, edges));
  const myGoalComments = await getGoalComments(myGoalRows.map((g) => g.id));

  const allPoints = ((talkingPoints.data ?? []) as unknown as Record<string, unknown>[]).map(toTalkingPoint);
  // The agenda going into a meeting held on day D (Saigon dates, UTC+7): points
  // raised before D ended and still open when D started. A point carried across
  // meetings was on each of those agendas, so it repeats; addressed_at is only
  // ever set around the meeting that covered it.
  const agendaFor = (heldOn: string): string[] => {
    const dayStart = Date.parse(`${heldOn}T00:00:00+07:00`);
    const dayEnd = Date.parse(`${heldOn}T23:59:59+07:00`);
    return allPoints
      .filter(
        (t) =>
          Date.parse(t.createdAt) <= dayEnd &&
          (t.addressedAt === null || Date.parse(t.addressedAt) >= dayStart),
      )
      .map((t) => t.body);
  };

  const checkinRows = ((checkins.data ?? []) as unknown as Record<string, unknown>[]).map(toCheckin);
  const lastHeldOn = (lastHeld.data as { held_on: string } | null)?.held_on ?? null;
  const preMeeting = buildPreMeeting(checkinRows, lastHeldOn, nextOn);

  // Who is away, and when (L.2). Two reads through time-off's door: the coach's
  // holidays so a date this member proposes is one their coach can make, and
  // the member's own so a 1-1 missed over their holiday is not called a miss.
  const [coachLeave, myLeave] = await Promise.all([
    coachId ? getLeaveSpans(coachId, today) : Promise.resolve([]),
    getLeaveSpans(actor.teamMemberId, today),
  ]);

  return {
    profileId,
    howIWork: toHowIWork(p),
    coachLeave,
    myLeave,
    coachName: coachPerson ? personName(coachPerson, "-") : null,
    goals: attachComments(myGoalRows, myGoalComments),
    priorities: ((priorities.data ?? []) as unknown as Record<string, unknown>[]).map((x) => toPriority(x, edges)),
    ocean: ocean.data ? toOcean(ocean.data as unknown as Record<string, unknown>) : null,
    cadenceDays: (p.cadence_days as number) ?? 14,
    nextOneOnOneOn: nextOn,
    suggestedOn: schedule?.suggested ?? null,
    hasMet: schedule?.hasMet ?? false,
    nextPrepMarkdown: ((nextPrep.data as { prep_shared_markdown: string | null } | null)?.prep_shared_markdown ?? "").trim() || null,
    nextPrepEdits: normaliseEdits((nextPrep.data as { prep_member_edits?: unknown } | null)?.prep_member_edits),
    nextStartsAt: booked ? meetingStartsAt(booked.startsAt, p.preferred_time as string | null) : null,
    preferredTime: shortTime(p.preferred_time as string | null),
    // A passed proposal is gone on both sides (openProposal, K.79).
    proposedOn: openProposal(p.proposed_one_on_one_on as string | null, today),
    // The member is told the same thing the coach is: this 1-1 did not happen.
    // It is the schedule's own answer, so the prompt disappears the moment the
    // coach moves it, marks it held or skips it.
    missedOn: schedule?.awaiting?.day ?? null,
    commitments: withHistoryCounts(commitmentList, historyCounts),
    talkingPoints: allPoints.filter((t) => t.addressedAt === null),
    recaps: ((recaps.data ?? []) as unknown as Record<string, unknown>[])
      .filter((r) => (r.shared_summary_markdown as string | null)?.trim())
      .map((r) => ({
        id: r.id as string,
        heldOn: r.held_on as string,
        sharedSummaryMarkdown: r.shared_summary_markdown as string,
        sharedPublishedAt: r.shared_published_at as string,
        agenda: agendaFor(r.held_on as string),
      })),
    checkins: checkinRows,
    preMeeting,
  };
}

export async function myUpdateCommitmentStatus(
  actor: TeamActor,
  commitmentId: string,
  status: CommitmentStatus,
  note: string,
): Promise<Result> {
  if (!(status in COMMITMENT_STATUS_LABELS)) return { ok: false, error: "Bad status." };
  const { data, error: dataError } = await companyOs
    .from("coaching_commitments")
    .select(
      "id, coaching_profile_id, status, coaching_profiles:coaching_profiles!coaching_profile_id(team_member_id)",
    )
    .eq("id", commitmentId)
    .maybeSingle();
  if (dataError) console.error("[team/coaching/member] coaching_commitments", dataError);
  if (!data) return { ok: false, error: "Not found." };
  const r = data as unknown as Record<string, unknown>;
  const prof = one(r.coaching_profiles as { team_member_id: string } | { team_member_id: string }[] | null);
  if (prof?.team_member_id !== actor.teamMemberId) return { ok: false, error: "Not found." };

  const { error } = await companyOs
    .from("coaching_commitments")
    .update({
      status,
      status_note: note.trim() || null,
      status_updated_by: actor.teamMemberId,
      status_updated_at: new Date().toISOString(),
      closed_at: status === "completed" || status === "dropped" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", commitmentId);
  if (error) return { ok: false, error: "Could not update the commitment." };
  await recordCommitmentChange(commitmentId, actor.teamMemberId, {
    statusBefore: r.status as CommitmentStatus,
    statusAfter: status,
  });

  // Mark the newest unanswered check-in responded (fire-and-forget semantics).
  const profileId = r.coaching_profile_id as string;
  const { data: checkin, error: checkinError } = await companyOs
    .from("coaching_checkins")
    .select("id")
    .eq("coaching_profile_id", profileId)
    .is("responded_at", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (checkinError) console.error("[team/coaching/member] coaching_checkins", checkinError);
  if (checkin) {
    // Fire-and-forget by design: the commitment update above already landed, so
    // a failure here is logged rather than turned into a failed Result.
    const { error: respondedError } = await companyOs
      .from("coaching_checkins")
      .update({ responded_at: new Date().toISOString() })
      .eq("id", (checkin as { id: string }).id);
    if (respondedError) console.error("[team/coaching/member] coaching_checkins responded", respondedError);
  }
  return { ok: true };
}

// The actor's own ACTIVE profile id, or null. The member tier's authorization
// subject: never a client-supplied profile id.
export async function myProfileId(actor: TeamActor): Promise<string | null> {
  const { data, error: dataError } = await companyOs
    .from("coaching_profiles")
    .select("id")
    .eq("team_member_id", actor.teamMemberId)
    .eq("active", true)
    .maybeSingle();
  if (dataError) console.error("[team/coaching/member] coaching_profiles", dataError);
  return (data as { id: string } | null)?.id ?? null;
}
