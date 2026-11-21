import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerNext, queries, resetQueries, type Query } from "./testing/query-log";

vi.mock("@/kernel/data/supabase", async () => ({ companyOs: (await import("./testing/query-log")).recordingClient }));

import {
  interviewKit,
  interviewSeatsOf,
  interviewsOfApplications,
  interviewsScoredBy,
  priorRoundsOf,
  seatEntitlementOf,
  seatInterviewer,
  seatOn,
} from "./interview-seats";

// A.69: each question or command is the query its caller used to build by
// hand around selectInterviews / selectInterviewInterviewers /
// selectInterviewScorecards / insertInterviewInterviewers. The expected steps
// are those callers' chains as they stood on main before the card, select
// strings included, byte for byte.
const interviews = (...steps: Query["steps"]): Query => ({ table: "interviews", steps });
const seats = (...steps: Query["steps"]): Query => ({ table: "interview_interviewers", steps });
const NAMES = "display_name, preferred_name, full_name, email";

const cases: [string, () => Promise<unknown>, Query][] = [
  // team lib/hiring.ts getTeamHiring
  [
    "interviewsOfApplications",
    () => interviewsOfApplications(["a1", "a2"]),
    interviews(
      [
        "select",
        "id, application_id, loop_step_id, scheduled_at, duration_minutes, status, mode, title, " +
          "requisition_loop_steps:requisition_loop_steps!loop_step_id ( name ), " +
          "interview_interviewers ( interviewer_id, people!interviewer_id ( email, metadata ) ), " +
          "interview_scorecards ( interviewer_id, submitted_at, recommendation, overall_score )",
      ],
      ["in", "application_id", ["a1", "a2"]],
    ),
  ],
  // team lib/hiring.ts getMyInterviewDay
  [
    "interviewSeatsOf",
    () => interviewSeatsOf("p1"),
    seats(
      [
        "select",
        "interview_id, " +
          "interviews:interviews!interview_id ( id, title, scheduled_at, duration_minutes, mode, status, application_id, " +
          "requisition_loop_steps:requisition_loop_steps!loop_step_id ( name ), " +
          "applications:applications!application_id ( id, archived_at, " +
          "job_requisitions:job_requisitions!job_requisition_id ( title ), " +
          `people:people!person_id ( ${NAMES} ) ) )`,
      ],
      ["eq", "interviewer_id", "p1"],
    ),
  ],
  [
    "interviewsScoredBy",
    () => interviewsScoredBy("p1", ["i1", "i2"]),
    {
      table: "interview_scorecards",
      steps: [
        ["select", "interview_id"],
        ["eq", "interviewer_id", "p1"],
        ["not", "submitted_at", "is", null],
        ["in", "interview_id", ["i1", "i2"]],
      ],
    },
  ],
  // team lib/interview-kit.ts actorHoldsSeat
  [
    "seatOn",
    () => seatOn("i1", "p1"),
    seats(["select", "interviewer_id"], ["eq", "interview_id", "i1"], ["eq", "interviewer_id", "p1"], ["maybeSingle"]),
  ],
  // team lib/interview-kit.ts ensureKitSeat
  [
    "seatEntitlementOf",
    () => seatEntitlementOf("i1"),
    interviews(
      [
        "select",
        `loop_step_id,
       applications:applications!application_id (
         job_requisitions:job_requisitions!job_requisition_id ( hiring_manager_id )
       ),
       requisition_loop_steps:requisition_loop_steps!loop_step_id ( requisition_loop_interviewers ( interviewer_id ) )`,
      ],
      ["eq", "id", "i1"],
      ["maybeSingle"],
    ),
  ],
  [
    "seatInterviewer",
    () => seatInterviewer("i1", "p1"),
    seats(["insert", { interview_id: "i1", interviewer_id: "p1", role: "interviewer" }]),
  ],
  // team lib/interview-kit.ts getInterviewKit
  [
    "interviewKit",
    () => interviewKit("i1"),
    interviews(
      [
        "select",
        `id, title, scheduled_at, duration_minutes, mode, application_id, loop_step_id,
       requisition_loop_steps:requisition_loop_steps!loop_step_id ( name, requisition_loop_interviewers ( interviewer_id ) ),
       applications:applications!application_id (
         id, ai_rating, ai_summary,
         job_requisitions:job_requisitions!job_requisition_id ( title, hiring_manager_id ),
         people:people!person_id (${NAMES})
       ),
       interview_interviewers ( interviewer_id, people!interviewer_id (${NAMES}) ),
       interview_scorecards ( interviewer_id, recommendation, overall_score, summary, submitted_at,
         scorecard_scores ( criterion, score, comment, position ) )`,
      ],
      ["eq", "id", "i1"],
      ["maybeSingle"],
    ),
  ],
  // team lib/interview-kit.ts getCarryForward
  [
    "priorRoundsOf",
    () => priorRoundsOf("a1", "i1"),
    interviews(
      ["select", "id, created_at, interview_scorecards ( interviewer_id, summary, submitted_at )"],
      ["eq", "application_id", "a1"],
      ["neq", "id", "i1"],
      ["order", "created_at", { ascending: false }],
    ),
  ],
];

beforeEach(() => resetQueries());

describe("hiring's interview questions and commands make their callers' queries", () => {
  it.each(cases)("%s", async (_name, ask, expected) => {
    await ask();
    expect(queries).toEqual([expected]);
  });

  it("keeps PostgREST's own error on a seat insert, so the unique-violation race can be told apart", async () => {
    answerNext({ data: null, error: { message: "duplicate key", code: "23505" } });
    expect(await seatInterviewer("i1", "p1")).toMatchObject({ error: { code: "23505" } });
  });

  it("hands a failed kit read's error back with no row, so the kit can raise rather than 404", async () => {
    answerNext({ data: null, error: { message: "embed failed" } });
    expect(await interviewKit("i1")).toEqual({ data: null, error: { message: "embed failed" } });
  });
});
