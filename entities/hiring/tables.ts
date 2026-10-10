// The Supabase tables the hiring entity owns (design §4).
export const HIRING_TABLES = [
  "application_stage_log",
  "application_stages",
  "applications",
  "candidate_messages",
  "candidate_profile",
  "candidate_sensitive",
  "candidates",
  "hiring_shortlists",
  "interview_interviewers",
  "interview_scorecards",
  "interviews",
  "job_requisitions",
  "offers",
  "requisition_loop_interviewers",
  "requisition_loop_steps",
  "scorecard_scores",
] as const;
