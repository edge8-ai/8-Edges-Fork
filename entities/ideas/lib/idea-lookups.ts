import { companyOs } from "@/kernel/data/supabase";
import { NAME_COLUMNS } from "@/kernel/config/people-name";
import { ilikeLiteral } from "@/kernel/data/postgrest-filter";

// The questions other entities ask about sparks, issues and theme reports
// (A.70, ADR 0018). Until A.70 the door handed out `selectIdeas(columns)`,
// `selectIssues(columns)` and `selectIdeaTrendReports(columns)`, and team,
// company-os, org and crm each chose their own columns and spelled "not
// archived" or "still open" in their own filters. Each question here is the
// exact query one caller built by hand: same columns, filters, order, limit and
// single-row form. entities/ideas/lib/idea-lookups.test.ts pins each one.
//
// The selects are literal, so PostgREST types the rows.

/** A spark as the team's Ideas pages show it to everyone: its fields and its author's name columns. */
const SHARED_SPARK =
  `id, kind, person_id, title, problem, data_needed, workflow, roi, story, takeaway, source_urls, office, ai_plan, ai_error, status, created_at, people:people!person_id(${NAME_COLUMNS})` as const;

/** The 200 newest sparks that are not archived, with their authors' names (team's shared ideas list). */
export function sharedSparks() {
  return companyOs.from("ideas").select(SHARED_SPARK).neq("status", "archived").order("created_at", { ascending: false }).limit(200);
}

/** One spark with its author's name, archived or not, or null (team's spark page decides who may see an archived one). */
export function sharedSpark(id: string) {
  return companyOs.from("ideas").select(SHARED_SPARK).eq("id", id).maybeSingle();
}

/**
 * The 30 newest sparks for the team assistant, of one kind when `kind` is
 * given, and with titles containing `search` literally when that is given
 * (its own % and _ are not wildcards). Archived sparks are included, as they
 * always were here.
 */
export function assistantSparks(kind: string | null, search: string) {
  let q = companyOs.from("ideas").select("title, kind, office, status, created_at, person_id, problem, roi, story, takeaway, ai_plan");
  if (kind) q = q.eq("kind", kind);
  if (search) q = ilikeLiteral(q, "title", search, (escaped) => `%${escaped}%`);
  return q.order("created_at", { ascending: false }).limit(30);
}

/** Who posted a spark since `sinceIso`, archived ones left out (team's weekly individual summary). */
export function sparkAuthorsSince(sinceIso: string) {
  return companyOs.from("ideas").select("person_id, created_at").gte("created_at", sinceIso).neq("status", "archived");
}

/** The kind and date of up to 1000 sparks that are not archived, unordered (the admin dashboard's innovation figures). */
export function liveSparkKinds() {
  return companyOs.from("ideas").select("kind, created_at").neq("status", "archived").limit(1000);
}

/** The issues still on the board, open or being solved, with their key result (org's office goals). */
export function openIssues() {
  return companyOs.from("issues").select("key_result_id, status").in("status", ["open", "solving"]);
}

/** The twelve newest theme reports (crm's market metrics). */
export function recentThemeReports() {
  return companyOs.from("idea_trend_reports").select("themes, source_count, generated_at").order("generated_at", { ascending: false }).limit(12);
}
