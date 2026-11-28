// The links between people and companies (person_companies) that other
// entities ask about (A.64, ADR 0018). A link is how a person counts as a
// client's contact, so these questions decide which contacts a team member, a
// portal user or the assistant is shown. Each question keeps exactly the
// filters its callers built by hand before A.64; where two callers asked
// almost the same thing in different ways (an order, a limit, maybeSingle),
// they stay two questions rather than one that quietly changes either.
//
// Nothing here filters archived or do-not-contact people: no caller asked the
// database to. The callers that skip them (the meeting-actions picker, the
// primary-contact pickers) read `archived_at` and `do_not_contact` from the
// embedded person and decide in their own code, as they did before.
import { companyOs } from "@/kernel/data/supabase";
import { insertPersonCompanies, updatePersonCompanies, upsertPersonCompanies } from "./writes";

// Every column the company-side readers take of a link and its person, as one
// row: the CRM company page, the hub's client team, the survey list, the
// proposal and affiliate pickers, the meeting-actions picker and the team
// assistant. Nothing sensitive is in it: names, email, archived and the
// do-not-contact flag are what the CRM contact list already shows.
const CONTACT_LINK =
  "person_id, company_id, title, role, is_primary, end_date, people:people!person_id(id, display_name, preferred_name, full_name, email, first_name, last_name, archived_at, do_not_contact)" as const;

/** Everyone linked to a company, each with their link and their name, email and archived/do-not-contact flags. Archived people are included. */
export async function contactLinksOfCompany(companyId: string) {
  return companyOs.from("person_companies").select(CONTACT_LINK).eq("company_id", companyId);
}

/** Which of these people are linked to the company. */
export async function linkedPersonIdsAt(companyId: string, personIds: string[]) {
  return companyOs.from("person_companies").select("person_id").eq("company_id", companyId).in("person_id", personIds);
}

/** The company's primary contact if it has one, else any linked person: the person an admin views the portal as. */
export async function firstContactOfCompany(companyId: string) {
  return companyOs
    .from("person_companies")
    .select("person_id")
    .eq("company_id", companyId)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();
}

/** The link of one person to one company, by the pair. More than one link raises, as maybeSingle does. */
export async function contactLinkAt(companyId: string, personId: string) {
  return companyOs.from("person_companies").select("person_id").eq("company_id", companyId).eq("person_id", personId).maybeSingle();
}

/** The id of a person's link to a company, at most one, as a list: empty when they are not linked. */
export async function personCompanyLinkIds(personId: string, companyId: string) {
  return companyOs.from("person_companies").select("id").eq("person_id", personId).eq("company_id", companyId).limit(1);
}

/** A person's link to a company with the job title it carries, or null. */
export async function personCompanyTitle(personId: string, companyId: string) {
  return companyOs
    .from("person_companies")
    .select("id, title")
    .eq("person_id", personId)
    .eq("company_id", companyId)
    .limit(1)
    .maybeSingle();
}

/** The linked people and their primary flag, for several companies at once: the affiliate list's primary contacts. */
export async function contactsOfCompanies(companyIds: string[]) {
  return companyOs.from("person_companies").select("company_id, is_primary, people(id, email, archived_at)").in("company_id", companyIds);
}

/**
 * Only which person is linked to which of these companies, nothing about the
 * person. The Workboard asks this for client contacts it may tag or assign,
 * and only on a read that is not client-safe (PR #2120 review, A.45), so it is
 * kept narrow on purpose rather than folded into the wider question above.
 */
export async function contactIdsOfCompanies(companyIds: string[]) {
  return companyOs.from("person_companies").select("person_id, company_id").in("company_id", companyIds);
}

/** The ids of every company a person is linked to. */
export async function companyIdsOfPerson(personId: string) {
  return companyOs.from("person_companies").select("company_id").eq("person_id", personId);
}

/** The companies a person is the primary contact of. */
export async function primaryCompanyIdsOfPerson(personId: string) {
  return companyOs.from("person_companies").select("company_id").eq("person_id", personId).eq("is_primary", true).not("company_id", "is", null);
}

/** Whether a person already has a primary company: at most one link id. */
export async function primaryCompanyLinkOfPerson(personId: string) {
  return companyOs.from("person_companies").select("id").eq("person_id", personId).eq("is_primary", true).limit(1);
}

/** A person's company, primary first, or null: the company an affiliate's portal membership is filed under. */
export async function mainCompanyOfPerson(personId: string) {
  return companyOs
    .from("person_companies")
    .select("company_id, is_primary")
    .eq("person_id", personId)
    .not("company_id", "is", null)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();
}

/** A person's companies with the primary flag, in no set order: the assistant's company prefill. */
export async function companiesOfPerson(personId: string) {
  return companyOs.from("person_companies").select("is_primary, companies(id, name, industry)").eq("person_id", personId);
}

/** A person's links with title, role and company name, primary first: the CRM contact page. */
export async function companyLinksOfPerson(personId: string) {
  return companyOs
    .from("person_companies")
    .select("company_id, title, role, is_primary, companies(id, name)")
    .eq("person_id", personId)
    .order("is_primary", { ascending: false });
}

/** One page (rows from..to, by id) of every link's person, company and end date: the audience builder. */
export async function personCompanyLinksPage(from: number, to: number) {
  return companyOs.from("person_companies").select("person_id, company_id, end_date").order("id").range(from, to);
}

/** Link a person to a company in a role. A second link of the same pair fails on the unique key. */
export async function linkPersonToCompany(personId: string, companyId: string, role: string) {
  return insertPersonCompanies({ person_id: personId, company_id: companyId, role });
}

/**
 * Link a person to a company unless they already are (Z.11's inquiry chain
 * retries its step): the unique (person_id, company_id) answers a second
 * write with nothing.
 */
export async function linkPersonToCompanyOnce(personId: string, companyId: string, isPrimary: boolean) {
  return upsertPersonCompanies({ person_id: personId, company_id: companyId, is_primary: isPrimary });
}

/** Set the job title a link carries. */
export async function setPersonCompanyTitle(linkId: string, title: string | null) {
  return updatePersonCompanies({ title, updated_at: new Date().toISOString() }).eq("id", linkId);
}
