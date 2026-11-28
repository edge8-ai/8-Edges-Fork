// The surveys a person has been assigned and not yet answered.
//
// This file is an overlay stub for 8-Edges-Fork, and only works while it sits at
// the SAME repo-relative path as the real module — today
// entities/org/lib/survey-assignments.ts.
//
// Fork note: the survey product is upstream's and does not ship (B.31), so nobody
// is ever assigned one. The team home asks and gets an empty list, and the
// "Open surveys" block renders nothing. Closing an assignment is a no-op, as it
// already is upstream for a response nobody was assigned.
export type OpenSurvey = {
  id: string;
  surveyName: string;
  href: string;
  cohortSlug: string | null;
  dueOn: string | null;
};

export async function openSurveysFor(_personId: string): Promise<OpenSurvey[]> {
  return [];
}

export async function completeSurveyAssignment(_input: {
  surveyId: string;
  personId: string;
  cohortSlug: string | null;
  responseId: string | null;
}): Promise<void> {}
