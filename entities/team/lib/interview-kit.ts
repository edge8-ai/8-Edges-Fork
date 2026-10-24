// The interview kit: everything a seated panelist needs to run one interview
// and file their scorecard, on /team. Access is by SEAT: a person may only
// open the kit for an interview they hold a seat on (interview_interviewers),
// and may only ever score as themselves. Blind-first is enforced HERE, on read:
// the other seats' scorecards (humans and the AI panelist) are withheld until
// this viewer has submitted their own. The carry-forward note from earlier
// rounds is always visible; it informs the next round without anchoring this one.

import { companyOs } from "@/kernel/data/supabase";
import { ReadFailure } from "@/kernel/data/read";
import { selectInterviews, selectInterviewInterviewers } from "@/entities/hiring";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { one } from "@/kernel/config/embedded";
import { recommendationFromDb, DEFAULT_CRITERIA, AI_PANELIST_EMAIL, isAiPanelist, type RecommendationKey, type AiScreenSummary } from "@/entities/hiring";
import { insertInterviewInterviewers } from "@/entities/hiring";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

type PersonRow = NamedPerson & { metadata?: unknown };

export type KitScore = { criterion: string; score: number | null; comment: string | null };

export type KitScorecard = {
  recommendation: RecommendationKey | null;
  overallScore: number | null;
  summary: string | null;
  submittedAt: string | null;
  scores: KitScore[];
};

export type KitSeat = {
  name: string;
  isAi: boolean;
  submitted: boolean;
  // Non-null only when revealed (this viewer has submitted their own scorecard).
  scorecard: KitScorecard | null;
};

export type InterviewKit = {
  interviewId: string;
  applicationId: string;
  candidateName: string;
  reqTitle: string;
  stepName: string;
  scheduledAt: string | null;
  durationMinutes: number | null;
  mode: string | null;
  aiRating: number | null;
  aiSummary: AiScreenSummary | null;
  carryForward: string | null;
  criteria: string[];
  myScorecard: KitScorecard | null;
  mySubmitted: boolean;
  revealed: boolean;
  otherSeats: KitSeat[];
};

// Whether this person holds a seat on this interview. The only authorization the
// team scorecard write trusts, never a client-supplied interviewer id.
export async function actorHoldsSeat(personId: string, interviewId: string): Promise<boolean> {
  const { data, error: seatError } = await selectInterviewInterviewers("interviewer_id")
    .eq("interview_id", interviewId)
    .eq("interviewer_id", personId)
    .maybeSingle();
  if (seatError) console.error("[team/interview-kit] interview_interviewers", seatError);
  return Boolean(data);
}

// Authorize an actor to file a scorecard on this interview, materialising their
// seat if they are entitled to one but were never booked onto the panel. Mirrors
// the kit read gate: a booked seat, a admin-loop-step interviewer (meant to be seated),
// the requisition's hiring manager, or an admin. Returns false for anyone else.
// Inserting the seat here (rather than on read) keeps a hover/prefetch from
// seating anyone, and guarantees the scorecard that follows is a real panel seat
// that the rest of the panel sees and the board counts.
export async function ensureKitSeat(actor: TeamActor, interviewId: string): Promise<boolean> {
  if (await actorHoldsSeat(actor.personId, interviewId)) return true;

  const { data: iv, error: ivError } = await selectInterviews(
      `loop_step_id,
       applications:applications!application_id (
         job_requisitions:job_requisitions!job_requisition_id ( hiring_manager_id )
       ),
       requisition_loop_steps:requisition_loop_steps!loop_step_id ( requisition_loop_interviewers ( interviewer_id ) )`,
    )
    .eq("id", interviewId)
    .maybeSingle();
  if (ivError) console.error("[team/interview-kit] interviews", ivError);
  if (!iv) return false;

  const app = one(iv.applications as Record<string, unknown> | Record<string, unknown>[] | null);
  const req = one(app?.job_requisitions as Record<string, unknown> | Record<string, unknown>[] | null);
  const step = one(iv.requisition_loop_steps as Record<string, unknown> | Record<string, unknown>[] | null);
  const onLoop = ((step?.requisition_loop_interviewers ?? []) as Record<string, unknown>[]).some(
    (li) => li.interviewer_id === actor.personId,
  );
  const isManager = actor.isAdmin || (req?.hiring_manager_id as string | null) === actor.personId;
  if (!onLoop && !isManager) return false;

  // Idempotent: swallow the unique-violation race where a parallel submit seated
  // them first. Any other error means the seat is not there, so refuse the write.
  const { error } = await insertInterviewInterviewers({ interview_id: interviewId, interviewer_id: actor.personId, role: "interviewer" });
  return !error || error.code === "23505";
}

function buildScorecard(sc: Record<string, unknown> | undefined): KitScorecard | null {
  if (!sc) return null;
  const scores = ((sc.scorecard_scores ?? []) as Record<string, unknown>[])
    .slice()
    .sort((a, b) => ((a.position as number) ?? 0) - ((b.position as number) ?? 0))
    .map((s) => ({
      criterion: s.criterion as string,
      score: (s.score as number | null) ?? null,
      comment: (s.comment as string | null) ?? null,
    }));
  return {
    recommendation: recommendationFromDb(sc.recommendation as string | null),
    overallScore: (sc.overall_score as number | null) ?? null,
    summary: (sc.summary as string | null) ?? null,
    submittedAt: (sc.submitted_at as string | null) ?? null,
    scores,
  };
}

export async function getInterviewKit(actor: TeamActor, interviewId: string): Promise<InterviewKit | null> {
  const { data: iv, error: kitError } = await selectInterviews(
      `id, title, scheduled_at, duration_minutes, mode, application_id, loop_step_id,
       requisition_loop_steps:requisition_loop_steps!loop_step_id ( name, requisition_loop_interviewers ( interviewer_id ) ),
       applications:applications!application_id (
         id, ai_rating, ai_summary,
         job_requisitions:job_requisitions!job_requisition_id ( title, hiring_manager_id ),
         people:people!person_id (${NAME_COLUMNS})
       ),
       interview_interviewers ( interviewer_id, people!interviewer_id (${NAME_COLUMNS}) ),
       interview_scorecards ( interviewer_id, recommendation, overall_score, summary, submitted_at,
         scorecard_scores ( criterion, score, comment, position ) )`,
    )
    .eq("id", interviewId)
    .maybeSingle();
  // A failed read must not look like a missing interview: logging it and
  // returning null turned a broken embed into a 404 on every kit after the
  // loop-interviewer table was dropped on 27 Aug.
  if (kitError) throw new ReadFailure("[team/interview-kit] interviews", kitError.message);
  if (!iv) return null;

  const app = one(iv.applications as Record<string, unknown> | Record<string, unknown>[] | null);
  const req = one(app?.job_requisitions as Record<string, unknown> | Record<string, unknown>[] | null);
  const step = one(iv.requisition_loop_steps as Record<string, unknown> | Record<string, unknown>[] | null);

  const seats = (iv.interview_interviewers ?? []) as Record<string, unknown>[];
  // Who may open (and score) the kit. A booked seat is the usual way in, but a
  // person named on the interview's loop step (they were meant to be seated) and
  // the requisition's hiring manager, plus any admin, get in too. Blind-first is
  // unchanged: they see the rest of the panel only after filing their own card,
  // and the seat is materialised on submit (ensureKitSeat), so that card counts
  // like any other. Without one of these, the page turns this null into a 404.
  const iAmSeated = seats.some((s) => s.interviewer_id === actor.personId);
  const iAmOnLoop = ((step?.requisition_loop_interviewers ?? []) as Record<string, unknown>[]).some(
    (li) => li.interviewer_id === actor.personId,
  );
  const iAmManager = actor.isAdmin || (req?.hiring_manager_id as string | null) === actor.personId;
  if (!iAmSeated && !iAmOnLoop && !iAmManager) return null;

  const scByInterviewer = new Map<string, Record<string, unknown>>();
  for (const sc of (iv.interview_scorecards ?? []) as Record<string, unknown>[]) {
    scByInterviewer.set(sc.interviewer_id as string, sc);
  }

  const myScorecard = buildScorecard(scByInterviewer.get(actor.personId));
  const mySubmitted = Boolean(myScorecard?.submittedAt);
  const revealed = mySubmitted;

  const otherSeats: KitSeat[] = seats
    .filter((s) => s.interviewer_id !== actor.personId)
    .map((s) => {
      const person = one(s.people as PersonRow | PersonRow[] | null);
      const sc = scByInterviewer.get(s.interviewer_id as string);
      return {
        name: personName(person, "panelist"),
        isAi: isAiPanelist(person),
        submitted: Boolean(sc?.submitted_at),
        // Blind-first: only hand back the actual scorecard once the viewer has
        // committed their own. Until then a client never receives it at all.
        scorecard: revealed ? buildScorecard(sc) : null,
      };
    })
    .sort((a, b) => Number(a.isAi) - Number(b.isAi) || a.name.localeCompare(b.name));

  // Rubric for the form: reuse what this viewer scored last time if present,
  // otherwise the default criteria. Per-role rubrics are a later plan item.
  const criteria =
    myScorecard && myScorecard.scores.length > 0
      ? myScorecard.scores.map((s) => s.criterion)
      : [...DEFAULT_CRITERIA];

  const carryForward = await getCarryForward((app?.id as string | null) ?? null, interviewId);

  return {
    interviewId: iv.id as string,
    applicationId: (app?.id as string | null) ?? "",
    candidateName: personName(one(app?.people as PersonRow | PersonRow[] | null), "panelist"),
    reqTitle: (req?.title as string | null) ?? "(untitled req)",
    stepName: (step?.name as string | null) || (iv.title as string | null) || "Interview",
    scheduledAt: (iv.scheduled_at as string | null) ?? null,
    durationMinutes: (iv.duration_minutes as number | null) ?? null,
    mode: (iv.mode as string | null) ?? null,
    aiRating: (app?.ai_rating as number | null) ?? null,
    aiSummary: (app?.ai_summary as AiScreenSummary | null) ?? null,
    carryForward,
    criteria,
    myScorecard,
    mySubmitted,
    revealed,
    otherSeats,
  };
}

// The AI panelist's summary from the most recent earlier round for this
// application. Always visible (it carries "still open / ask next round" notes);
// returns null when there is no prior AI scorecard.
async function getCarryForward(applicationId: string | null, currentInterviewId: string): Promise<string | null> {
  if (!applicationId) return null;
  const { data: ai, error: aiPersonError } = await companyOs
    .from("people")
    .select("id")
    .eq("email", AI_PANELIST_EMAIL)
    .maybeSingle();
  if (aiPersonError) console.error("[team/interview-kit] people", aiPersonError);
  const aiPersonId = (ai as { id: string } | null)?.id ?? null;
  if (!aiPersonId) return null;

  const { data: prior, error: priorError } = await selectInterviews("id, created_at, interview_scorecards ( interviewer_id, summary, submitted_at )")
    .eq("application_id", applicationId)
    .neq("id", currentInterviewId)
    .order("created_at", { ascending: false });
  if (priorError) console.error("[team/interview-kit] interviews", priorError);

  for (const round of (prior ?? []) as Record<string, unknown>[]) {
    const scs = (round.interview_scorecards ?? []) as Record<string, unknown>[];
    const aiSc = scs.find((s) => s.interviewer_id === aiPersonId && s.submitted_at && s.summary);
    if (aiSc) return (aiSc.summary as string).trim();
  }
  return null;
}
