// The questions other entities ask of a survey's definition: the survey row and
// its questions (surveys, survey_fields), A.67. org builds the surveys; portal
// runs the public runner at /surveys/[slug] and retreats links a feedback survey
// to an event. Until A.67 they read through `selectSurveys` and
// `selectSurveyFields` and each stated the row shape for itself.
//
// The runner's questions are public: anyone with the link reaches them. Each
// selects exactly the columns its caller read before, so a public read is never
// handed a column it did not have.
import type { FieldConfig, SurveyFieldRow, SurveyRow } from "./surveys-schema";
import { selectSurveyFields, selectSurveys } from "./reads";

export type SurveyForSubmission = {
  id: string;
  name: string;
  status: string | null;
  is_anonymous: boolean | null;
  archived_at: string | null;
  purpose: string | null;
  metadata: unknown;
};

/** The survey a response is being submitted to, by its slug, or null when no survey has it. */
export async function surveyForSubmission(slug: string) {
  const { data, error } = await selectSurveys("id, name, status, is_anonymous, archived_at, purpose, metadata").eq("slug", slug).maybeSingle();
  return { data: data as SurveyForSubmission | null, error };
}

/** The survey a file is being uploaded to, by its slug: just enough to say whether it takes responses. */
export async function surveyForUpload(slug: string) {
  const { data, error } = await selectSurveys("id, status, archived_at").eq("slug", slug).maybeSingle();
  return { data: data as { id: string; status: string | null; archived_at: string | null } | null, error };
}

/** A survey's name and description, by its slug: the runner page's title. */
export async function surveyHeadline(slug: string) {
  const { data, error } = await selectSurveys("name, description").eq("slug", slug).maybeSingle();
  return { data: data as { name: string; description: string | null } | null, error };
}

/** The survey the runner page renders, by its slug, archived ones included so the page can refuse them. */
export async function surveyToRun(slug: string) {
  const { data, error } = await selectSurveys(
    "id, slug, name, description, status, is_anonymous, intro_text, thank_you_text, purpose, created_at, updated_at, archived_at",
  )
    .eq("slug", slug)
    .maybeSingle();
  return { data: data as (SurveyRow & { archived_at: string | null }) | null, error };
}

/** A survey's id when a survey has that id, or null: whether an event's feedback survey still exists. */
export async function surveyWithId(surveyId: string) {
  const { data, error } = await selectSurveys("id").eq("id", surveyId).maybeSingle();
  return { data: data as { id: string } | null, error };
}

/** A survey's slug, or null when no survey has that id: the link a feedback QR points at. */
export async function surveySlug(surveyId: string) {
  const { data, error } = await selectSurveys("slug").eq("id", surveyId).maybeSingle();
  return { data: data as { slug: string } | null, error };
}

/** Every published survey that is not archived, by name: the event page's feedback survey picker. */
export async function publishedSurveyOptions() {
  const { data, error } = await selectSurveys("id, name").is("archived_at", null).eq("status", "published").order("name", { ascending: true });
  return { data: data as { id: string; name: string }[] | null, error };
}

/** A survey's questions in the order they are asked. */
export async function surveyFields(surveyId: string) {
  const { data, error } = await selectSurveyFields("id, survey_id, position, type, label, help_text, required, config")
    .eq("survey_id", surveyId)
    .order("position", { ascending: true });
  return { data: data as SurveyFieldRow[] | null, error };
}

/** One question of a survey, or null when that survey has no question with that id: where an upload is going. */
export async function surveyField(surveyId: string, fieldId: string) {
  const { data, error } = await selectSurveyFields("id, type, config").eq("id", fieldId).eq("survey_id", surveyId).maybeSingle();
  return { data: data as { id: string; type: string; config: FieldConfig | null } | null, error };
}
