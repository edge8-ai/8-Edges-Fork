// The questions the team hub asks of interviews, their panel seats and their
// scorecards, and the one seat it writes (A.69, ADR 0018). Until A.69 the door
// handed out `selectInterviews`, `selectInterviewInterviewers`,
// `selectInterviewScorecards` and `insertInterviewInterviewers`, and the team
// hiring board, the manager's interview day and the interview kit each built
// their own query. Each question here makes exactly the query its caller made.
//
// The embeds (the loop step, the application and its requisition, the panel,
// the scorecards) are typed `unknown` here: their readers in the team hub
// already narrow each one where they use it, through `one()`, and typing them
// twice would only give the two copies room to drift.
import { companyOs } from "@/kernel/data/supabase";
import type { Database } from "@/kernel/data/supabase/database.types";
import { NAME_COLUMNS } from "@/kernel/config/people-name";

type InterviewRow = Database["company_os"]["Tables"]["interviews"]["Row"];

/** An interview as the team hiring board indexes it: its round, its panel and how the panel scored it. */
export type BoardInterview = Pick<
  InterviewRow,
  "id" | "application_id" | "loop_step_id" | "scheduled_at" | "duration_minutes" | "status" | "mode" | "title"
> & { requisition_loop_steps: unknown; interview_interviewers: unknown; interview_scorecards: unknown };

/**
 * Every interview on these applications, whether or not the ingest matched it
 * to a loop step, with its panel's seats and scorecards: the board's grid, its
 * booked-by-step list and its count of unmatched interviews.
 */
export async function interviewsOfApplications(applicationIds: string[]) {
  const { data, error } = await companyOs
    .from("interviews")
    .select(
      "id, application_id, loop_step_id, scheduled_at, duration_minutes, status, mode, title, " +
        "requisition_loop_steps:requisition_loop_steps!loop_step_id ( name ), " +
        "interview_interviewers ( interviewer_id, people!interviewer_id ( email, metadata ) ), " +
        "interview_scorecards ( interviewer_id, submitted_at, recommendation, overall_score )",
    )
    .in("application_id", applicationIds);
  return { data: data as unknown as BoardInterview[] | null, error };
}

/** A seat a person holds, with the interview it is on: one line of the manager's interview day. */
export type InterviewDaySeat = { interview_id: string; interviews: unknown };

/**
 * Every interview seat this person holds, with the interview, its round, its
 * application (archived or not) and the candidate and role behind it.
 */
export async function interviewSeatsOf(personId: string) {
  const { data, error } = await companyOs
    .from("interview_interviewers")
    .select(
      "interview_id, " +
        "interviews:interviews!interview_id ( id, title, scheduled_at, duration_minutes, mode, status, application_id, " +
        "requisition_loop_steps:requisition_loop_steps!loop_step_id ( name ), " +
        "applications:applications!application_id ( id, archived_at, " +
        "job_requisitions:job_requisitions!job_requisition_id ( title ), " +
        `people:people!person_id ( ${NAME_COLUMNS} ) ) )`,
    )
    .eq("interviewer_id", personId);
  return { data: data as unknown as InterviewDaySeat[] | null, error };
}

/** Which of these interviews this person has submitted a scorecard on. */
export async function interviewsScoredBy(personId: string, interviewIds: string[]) {
  return companyOs
    .from("interview_scorecards")
    .select("interview_id")
    .eq("interviewer_id", personId)
    .not("submitted_at", "is", null)
    .in("interview_id", interviewIds);
}

/** This person's seat on this interview, or null when they hold none. */
export async function seatOn(interviewId: string, personId: string) {
  return companyOs
    .from("interview_interviewers")
    .select("interviewer_id")
    .eq("interview_id", interviewId)
    .eq("interviewer_id", personId)
    .maybeSingle();
}

/**
 * Seats this person on this interview's panel as an interviewer. The error is
 * PostgREST's own, so the caller can tell the unique-violation race (23505)
 * from any other failure.
 */
export async function seatInterviewer(interviewId: string, personId: string) {
  return companyOs
    .from("interview_interviewers")
    .insert({ interview_id: interviewId, interviewer_id: personId, role: "interviewer" });
}

/** What decides whether someone with no seat may still score an interview: its loop step's interviewers and its requisition's hiring manager. */
export type SeatEntitlement = Pick<InterviewRow, "loop_step_id"> & { applications: unknown; requisition_loop_steps: unknown };

/** An interview's loop-step interviewers and requisition hiring manager, or null when no interview has that id. */
export async function seatEntitlementOf(interviewId: string) {
  const { data, error } = await companyOs
    .from("interviews")
    .select(
      `loop_step_id,
       applications:applications!application_id (
         job_requisitions:job_requisitions!job_requisition_id ( hiring_manager_id )
       ),
       requisition_loop_steps:requisition_loop_steps!loop_step_id ( requisition_loop_interviewers ( interviewer_id ) )`,
    )
    .eq("id", interviewId)
    .maybeSingle();
  return { data: data as unknown as SeatEntitlement | null, error };
}

/** One interview as its kit shows it: the round, the candidate, the role, the panel and every scorecard with its scores. */
export type KitInterview = Pick<
  InterviewRow,
  "id" | "title" | "scheduled_at" | "duration_minutes" | "mode" | "application_id" | "loop_step_id"
> & {
  requisition_loop_steps: unknown;
  applications: unknown;
  interview_interviewers: unknown;
  interview_scorecards: unknown;
};

/**
 * One interview with everything its kit needs, or null when no interview has
 * that id. Every scorecard comes back: withholding the others' until the
 * viewer has filed their own (blind-first) is the kit's job, on read.
 */
export async function interviewKit(interviewId: string) {
  const { data, error } = await companyOs
    .from("interviews")
    .select(
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
  return { data: data as unknown as KitInterview | null, error };
}

/** An earlier round of an application, with its scorecards' summaries. */
export type PriorRound = Pick<InterviewRow, "id" | "created_at"> & { interview_scorecards: unknown };

/** Every other round of this application, newest first: where the kit finds the AI panelist's carry-forward note. */
export async function priorRoundsOf(applicationId: string, currentInterviewId: string) {
  const { data, error } = await companyOs
    .from("interviews")
    .select("id, created_at, interview_scorecards ( interviewer_id, summary, submitted_at )")
    .eq("application_id", applicationId)
    .neq("id", currentInterviewId)
    .order("created_at", { ascending: false });
  return { data: data as unknown as PriorRound[] | null, error };
}
