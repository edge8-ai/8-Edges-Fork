// A survey's average score and NPS, for the Revenue and Operations cockpits.
//
// This file is an overlay stub for 8-Edges-Fork, and only works while it sits at
// the SAME repo-relative path as the real module — today
// entities/org/lib/survey-scores.ts.
//
// Fork note: the survey product is upstream's and does not ship (B.31). Both
// reads answer the way the real module answers a survey that does not exist:
// no average, no NPS, zero responses, so the cockpit tiles read as empty
// rather than as a failure.
export type SurveyScore = { avg: number | null; responses: number; scale: number };

export async function getSurveyScore(_slug: string): Promise<SurveyScore> {
  return { avg: null, responses: 0, scale: 5 };
}

export type SurveyNps = { nps: number | null; responses: number; error: string | null };

export async function getSurveyNps(_slug: string): Promise<SurveyNps> {
  return { nps: null, responses: 0, error: null };
}
