// The questions other entities ask of survey responses and answers, and the
// commands the public runner performs on them (A.67). org owns the survey engine
// end to end; until A.67 the door handed out `selectSurveyResponses`,
// `selectSurveyAnswers` and the three raw writers, and portal, retreats,
// crm and onboarding each chose their own columns and filters.
import type { TablesInsert } from "@/kernel/data/supabase/database.types";
import { ilikeLiteralCondition } from "@/kernel/data/postgrest-filter";
import { readOr } from "@/kernel/data/read";
import type { PersonSurveyResponse } from "../slots";
import { selectSurveyAnswers, selectSurveyResponses } from "./reads";
import { deleteSurveyResponses, insertSurveyAnswers, insertSurveyResponses } from "./writes";

type Embedded<T> = T | T[] | null;

/** Save a response row and return its id. */
export async function recordSurveyResponse(row: TablesInsert<{ schema: "company_os" }, "survey_responses">) {
  return insertSurveyResponses(row).select("id").single();
}

/** Save a response's answers. */
export async function recordSurveyAnswers(rows: TablesInsert<{ schema: "company_os" }, "survey_answers">[]) {
  return insertSurveyAnswers(rows);
}

/** Remove a response whose answers could not be saved, so no half-saved response is left behind. */
export async function discardSurveyResponse(responseId: string) {
  return deleteSurveyResponses().eq("id", responseId);
}

/**
 * The surveys a retreat guest has answered for this cohort, matched by person id
 * or by email. The email can be one a visitor typed, so it is matched literally
 * and quoted: a typed wildcard, comma or paren must not reach other guests'
 * responses, and an address no pattern can spell matches nobody. With neither
 * to match on, the answer is no rows and nothing is read.
 */
export async function cohortSurveysAnsweredBy(cohortSlug: string, guest: { personId?: string; email?: string }) {
  const or: string[] = [];
  if (guest.personId) or.push(`person_id.eq.${guest.personId}`);
  const byEmail = guest.email ? ilikeLiteralCondition("respondent_email", guest.email) : null;
  if (byEmail) or.push(byEmail);
  if (or.length === 0) return { data: [] as { surveys: Embedded<{ slug: string }> }[], error: null };
  const { data, error } = await selectSurveyResponses("surveys(slug)").eq("cohort_slug", cohortSlug).or(or.join(","));
  return { data: data as { surveys: Embedded<{ slug: string }> }[] | null, error };
}

export type CohortFeedbackResponse = {
  submitted_at: string | null;
  surveys: Embedded<{ id: string; slug: string; name: string }>;
};

/** Every response stamped with this cohort, with its survey: an event's feedback results. */
export async function cohortFeedbackResponses(cohortSlug: string) {
  const { data, error } = await selectSurveyResponses("submitted_at, surveys(id, slug, name)").eq("cohort_slug", cohortSlug);
  return { data: data as CohortFeedbackResponse[] | null, error };
}

/** A person's survey responses, newest first: the CRM's person view. Anonymous responses carry no person id. */
export async function surveyResponsesOfPerson(personId: string) {
  const { data, error } = await selectSurveyResponses("id, survey_id, submitted_at, created_at")
    .eq("person_id", personId)
    .order("created_at", { ascending: false });
  return { data: data as { id: string; survey_id: string; submitted_at: string | null; created_at: string }[] | null, error };
}

/**
 * The surveys a person answered, newest first: the personSurveyResponses slot
 * that crm's contact page takes (ADR 0032). A failed read lists none, which is
 * what the page has always shown for one; the failure is logged.
 */
export async function personSurveyResponses(personId: string): Promise<PersonSurveyResponse[]> {
  return readOr(await surveyResponsesOfPerson(personId), "[org] a contact's survey responses", []);
}

/** Every answer value of these responses: the onboarding cycle averages the numeric ones. */
export async function surveyAnswerValues(responseIds: string[]) {
  const { data, error } = await selectSurveyAnswers("response_id, value").in("response_id", responseIds);
  return { data: data as { response_id: string; value: string | null }[] | null, error };
}
