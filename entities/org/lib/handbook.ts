// The questions the team assistant asks of the company handbook
// (company_information), A.67. The handbook is org's; until A.67 team chose the
// columns and spelled "not archived" itself through `selectCompanyInformation`.
import { matchEveryTerm } from "@/kernel/data/postgrest-filter";
import { selectCompanyInformation } from "./reads";

export type HandbookTitle = { slug: string; title: string; category: string | null };
export type HandbookEntry = HandbookTitle & { body: string | null; updated_at: string };

/** Every live handbook page's title, alphabetically, at most 200: what the handbook covers. */
export async function handbookTitles() {
  const { data, error } = await selectCompanyInformation("slug, title, category").is("archived_at", null).order("title").limit(200);
  return { data: data as HandbookTitle[] | null, error };
}

/**
 * The five most recently updated live handbook pages in which every term
 * appears in the title or the body. The terms are stripped of filter syntax by
 * `matchEveryTerm`, so a typed comma or paren cannot add a condition.
 */
export async function handbookPagesMatching(terms: readonly string[]) {
  const q = selectCompanyInformation("slug, title, category, body, updated_at").is("archived_at", null);
  const { data, error } = await matchEveryTerm(q, ["title", "body"], terms).order("updated_at", { ascending: false }).limit(5);
  return { data: data as HandbookEntry[] | null, error };
}
