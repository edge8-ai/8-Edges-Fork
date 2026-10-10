// Survey responses, read for the Team member profile and the company profile.
//
// This file is an overlay stub for 8-Edges-Fork, and only works while it sits at
// the SAME repo-relative path as the real module — today
// entities/org/lib/surveys.ts.
//
// Fork note: the survey product (builder, public runner, assignments, scores) is
// upstream's and does not ship (B.31), so there are no responses to read. The
// form-field engine in surveys-schema.ts DOES ship, because reviews, onboarding
// and the AI Journey build their forms with it, so it is re-exported exactly as
// the real module does.
export * from "./surveys-schema";

export type PersonSurveyResponse = {
  id: string;
  surveyId: string;
  surveyName: string;
  submittedAt: string;
  answeredCount: number;
  fieldCount: number;
  fields: { fieldId: string; label: string; value: string | null; sensitive: boolean }[];
};

export async function getPersonSurveyResponses(_personId: string): Promise<PersonSurveyResponse[]> {
  return [];
}

export type CompanySurveyResponse = PersonSurveyResponse & { respondentName: string };

export async function getSurveyResponsesForCompany(_companyId: string): Promise<CompanySurveyResponse[]> {
  return [];
}
