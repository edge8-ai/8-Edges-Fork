// The affiliate codes other entities ask about and change (A.64, ADR 0018).
// Contacts owns the affiliates table because a code belongs to a person or a
// company; the affiliate programme itself (activation, commissions, the
// shelf) is crm's, and the portal shows a client their own codes. A code is
// active while `active` is true; deactivating keeps the row, so a code can be
// reactivated rather than minted twice.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert } from "@/kernel/data/supabase/database.types";
import { insertAffiliates, updateAffiliates } from "./writes";

/** A person's codes, in no set order. */
export async function affiliateCodesOfPerson(personId: string) {
  return companyOs.from("affiliates").select("id, code, active").eq("person_id", personId);
}

/** A company's codes, in no set order. */
export async function affiliateCodesOfCompany(companyId: string) {
  return companyOs.from("affiliates").select("id, code, active").eq("company_id", companyId);
}

/** The codes held by a person or by any of these companies: what a portal user's referrals page counts. */
export async function affiliateCodesOfPersonOrCompanies(personId: string, companyIds: string[]) {
  const orParts = [`person_id.eq.${personId}`];
  if (companyIds.length) orParts.push(`company_id.in.(${companyIds.join(",")})`);
  return companyOs.from("affiliates").select("id, code, active").or(orParts.join(","));
}

/** The person-held codes of each of these people. */
export async function affiliateCodesOfPeople(personIds: string[]) {
  return companyOs.from("affiliates").select("person_id, code, active").in("person_id", personIds);
}

/** Each code's holder: its code and the name of the person or company behind it. */
export async function affiliateHolders(affiliateIds: string[]) {
  return companyOs.from("affiliates").select("code, people(display_name, preferred_name, full_name, email), companies(name)").in("id", affiliateIds);
}

/** Every code with its programme, coupon and holder (person or company, archived ones included), oldest first. */
export async function allAffiliates() {
  return companyOs
    .from("affiliates")
    .select(
      "id, code, program_type, active, stripe_coupon_id, created_at, person_id, company_id, people(id, display_name, preferred_name, full_name, email, archived_at), companies(id, name, archived_at)",
    )
    .order("created_at", { ascending: true });
}

export type AffiliateHolder = { companyId: string } | { personId: string };

/** One holder's codes with programme and coupon, oldest first: the affiliate shelf. */
export async function affiliateCodeDetailsOf(holder: AffiliateHolder) {
  const query = companyOs
    .from("affiliates")
    .select("id, code, program_type, active, stripe_coupon_id, created_at")
    .order("created_at", { ascending: true });
  return "companyId" in holder ? query.eq("company_id", holder.companyId) : query.eq("person_id", holder.personId);
}

/** The codes that start with this prefix, case-insensitively: what a new code must not collide with. */
export async function affiliateCodesStartingWith(prefix: string) {
  return companyOs.from("affiliates").select("code").ilike("code", `${prefix}%`);
}

/** A code's commission rate, by id, or null. */
export async function affiliateRate(affiliateId: string) {
  return companyOs.from("affiliates").select("id, rate").eq("id", affiliateId).maybeSingle();
}

/** Mint a code for a person or a company. */
export async function createAffiliateCode(row: TablesInsert<{ schema: "company_os" }, "affiliates">) {
  return insertAffiliates(row);
}

/** Turn one code back on, by id. */
export async function reactivateAffiliateCode(affiliateId: string) {
  return updateAffiliates({ active: true, updated_at: new Date().toISOString() }).eq("id", affiliateId);
}

/** Turn off every active code a person or company holds; answers the ids it turned off. */
export async function deactivateAffiliateCodesOf(holder: AffiliateHolder) {
  // One statement, filter included, so the writers-filtered test can see the
  // update is never unscoped.
  const [column, id] = "companyId" in holder ? (["company_id", holder.companyId] as const) : (["person_id", holder.personId] as const);
  return updateAffiliates({ active: false, updated_at: new Date().toISOString() }).eq(column, id).eq("active", true).select("id");
}
