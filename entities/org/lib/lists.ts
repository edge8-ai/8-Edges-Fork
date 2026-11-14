import { companyOsUntyped } from "@/kernel/data/supabase";
import { countRows, pageList, type ListParams, type ListResult } from "@/kernel/data/paged-list";
import { mustRows } from "@/kernel/data/read";

// The admin shelves' paged lists and badge counts over org's tables (ADR 0025,
// ADR 0029). The kernel's pager names no table: each question here hands it
// this owner's `.from()`, so check:table-ownership resolves every read and the
// owner answers for it. They replace company-os's listEntity/countEntity, which
// took the table as a bare string. The caller still picks its columns and its
// filters, as it did; each list is what the page asked listEntity for.

export function equipmentPage<T>(select: string, params: ListParams = {}): Promise<ListResult<T>> {
  return pageList<T>(() => companyOsUntyped.from("equipment"), select, params);
}

export function countSurveys(filters: ListParams["filters"] = {}, exclude?: ListParams["exclude"]): Promise<number> {
  return countRows(() => companyOsUntyped.from("surveys"), "surveys", filters, exclude);
}

export function countSurveyResponses(filters: ListParams["filters"] = {}, exclude?: ListParams["exclude"]): Promise<number> {
  return countRows(() => companyOsUntyped.from("survey_responses"), "survey_responses", filters, exclude);
}

export function countSurveyFields(filters: ListParams["filters"] = {}, exclude?: ListParams["exclude"]): Promise<number> {
  return countRows(() => companyOsUntyped.from("survey_fields"), "survey_fields", filters, exclude);
}

/**
 * The slugs of every performance-review form: the company's own two and each
 * client review framework's (CR.1.2). Their answers go to performance_reviews,
 * never survey_responses, so the Surveys list hides them rather than show
 * "Results (0)". Read by purpose, so a new framework's forms hide themselves.
 * A failed read raises: an empty list would show every review form instead.
 */
export async function reviewFormSlugs(): Promise<string[]> {
  const rows = mustRows(await companyOsUntyped.from("surveys").select("slug").eq("purpose", "performance_review"), "[org/lists] review form slugs");
  return (rows as Array<{ slug: string }>).map((r) => r.slug);
}
