// The deals other entities ask about (A.63): the company dashboard's figures,
// the team assistant's pipeline tools, the campaigns audience, the portal's
// Build Your Team request and its referrals page. Each question keeps crm's
// meaning of a deal inside it: "open" is status open and not set aside
// (archived), "won" is status won, whatever stage the deal sits in.
import { companyOs } from "@/kernel/data/supabase";
import { ilikeLiteral } from "@/kernel/data/postgrest-filter";

export type DealStatus = "open" | "won" | "lost";

/** Every live deal's status, USD amount and dates, at most `limit`: the admin dashboard's revenue tiles. */
export async function liveDealFigures(limit: number) {
  return companyOs.from("deals").select("status, amount_usd_cents, created_at, closed_at").is("archived_at", null).limit(limit);
}

/** The USD amount of every open deal: the open pipeline. */
export async function openPipelineAmounts() {
  return companyOs.from("deals").select("amount_usd_cents").eq("status", "open").is("archived_at", null);
}

/** The company of every deal won between two timestamps, inclusive. */
export async function dealsWonBetween(from: string, to: string) {
  return companyOs.from("deals").select("company_id").eq("status", "won").gte("closed_at", from).lte("closed_at", to);
}

/** The contact and company on each open deal, ordered by id, for the rows from..to (a page). */
export async function openDealContactsPage(from: number, to: number) {
  return companyOs
    .from("deals")
    .select("person_id, company_id")
    .eq("status", "open")
    .is("archived_at", null)
    .order("id")
    .range(from, to);
}

/** How many deals sit in a stage: a new deal's position at the end of it. */
export async function dealCountInStage(stageId: string) {
  return companyOs.from("deals").select("id", { count: "exact", head: true }).eq("stage_id", stageId);
}

export type DealFilter = { companyId?: string; titleContains?: string; status?: DealStatus };

/**
 * Live deals, newest first, at most `limit`, narrowed by company, by a literal
 * piece of the title and by status. The contact person on the deal
 * (person_id) is deliberately not selected: the team assistant shows these to
 * every employee.
 */
export async function liveDeals(filter: DealFilter, limit: number) {
  let query = companyOs
    .from("deals")
    .select("title, status, stage_id, owner_id, company_id, amount_cents, currency, amount_usd_cents, expected_close_date, closed_at")
    .is("archived_at", null);
  if (filter.companyId) query = query.eq("company_id", filter.companyId);
  if (filter.titleContains) query = ilikeLiteral(query, "title", filter.titleContains, (escaped) => `%${escaped}%`);
  if (filter.status) query = query.eq("status", filter.status);
  return query.order("created_at", { ascending: false }).limit(limit);
}

export type Referrer = { personId: string; companyIds: string[]; affiliateIds: string[] };

/**
 * The deals a referrer brought in, newest first: referred by the person, by
 * one of their companies, or through one of their affiliate codes. Archived
 * deals are included, because a deal set aside is still the referrer's,
 * shown as closed.
 */
export async function dealsReferredBy(referrer: Referrer) {
  const conditions = [`referrer_id.eq.${referrer.personId}`];
  if (referrer.companyIds.length) conditions.push(`referrer_company_id.in.(${referrer.companyIds.join(",")})`);
  if (referrer.affiliateIds.length) conditions.push(`affiliate_id.in.(${referrer.affiliateIds.join(",")})`);
  return companyOs
    .from("deals")
    .select("id, title, status, archived_at, referrer_id, affiliate_id, companies!company_id(name)")
    .or(conditions.join(","))
    .order("created_at", { ascending: false });
}
