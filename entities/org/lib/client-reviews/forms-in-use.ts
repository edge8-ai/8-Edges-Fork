import { mustCount, mustRows } from "@/kernel/data/read";
import { companyOs } from "@/kernel/data/supabase";
import { isUuid } from "@/kernel/config/slug";

// Whether a form is in use by an open client review cycle (CR.1.5). While it
// is, the survey builder may correct wording but may not delete a question,
// change its config or whether it is required, or close or delete the form:
// any of those would break answers already given or about to be given. The
// builder's own lock looks for survey responses, which a review form never
// has, so it cannot see this.

/**
 * True when a framework that uses this form, as the member's or the rater's,
 * has a cycle that is not closed. A failed read raises: answering "not in use"
 * on a failure would unlock the very edits this exists to stop.
 */
export async function isFormInOpenCycle(surveyId: string): Promise<boolean> {
  if (!isUuid(surveyId)) return false;
  const frameworks = mustRows(
    await companyOs.from("review_frameworks").select("id").or(`member_survey_id.eq.${surveyId},rater_survey_id.eq.${surveyId}`),
    "[org/client-reviews] frameworks using a form",
  );
  if (frameworks.length === 0) return false;
  const open = mustCount(
    await companyOs
      .from("review_cycles")
      .select("id", { count: "exact", head: true })
      .in(
        "framework_id",
        frameworks.map((f) => f.id),
      )
      .is("closed_at", null),
    "[org/client-reviews] open cycles on a form",
  );
  return open > 0;
}
