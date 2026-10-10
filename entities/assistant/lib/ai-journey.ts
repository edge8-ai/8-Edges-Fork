// AI Journey surveys: the pre/post event pair behind /surveys/ai-journey
// (purpose ai_journey_pre) and /surveys/ai-journey-feedback (ai_journey_post),
// shared across events and attributed per event via ?cohort=<event-slug>.
//
// The pre survey asks company + industry as ordinary questions tagged with
// config.maps_to ("companies.name" / "companies.industry"). For a logged-in
// respondent those values are resolved from the CRM: a known value hides the
// question (the page filters it out and the API injects the value on submit,
// so every stored response still carries a complete answer set for roll-ups).
// When the CRM has a company but no industry, the respondent's answer is
// written back so the survey doubles as CRM enrichment.

import { companyOs } from "@/kernel/data/supabase";
import { updateCompanies } from "@/kernel/identity/writes";
import { selectPersonCompanies } from "@/entities/contacts";
import type { SurveyFieldRow } from "@/entities/org";

export function isAiJourneyPurpose(purpose: string | null | undefined): boolean {
  return purpose === "ai_journey_pre" || purpose === "ai_journey_post";
}

type CompanyRow = { id: string; name: string | null; industry: string | null };

// The person's company for prefill: the is_primary link wins, else the first
// (same convention as portal-assume and invoices).
async function primaryCompanyOf(personId: string): Promise<CompanyRow | null> {
  const { data, error: personCompaniesError } = await selectPersonCompanies("is_primary, companies(id, name, industry)")
    .eq("person_id", personId);
  if (personCompaniesError) console.error("[assistant] person_companies read failed:", personCompaniesError.message);
  const links = (data ?? []) as { is_primary: boolean; companies: CompanyRow | CompanyRow[] | null }[];
  const best = links.find((l) => l.is_primary) ?? links[0] ?? null;
  const company = Array.isArray(best?.companies) ? best?.companies[0] : best?.companies;
  return company ?? null;
}

// maps_to → CRM-known value. Only company name + industry are supported today;
// name/email never appear here (the runner's identity step owns those).
export async function resolveCompanyPrefill(personId: string): Promise<Record<string, string>> {
  const company = await primaryCompanyOf(personId);
  if (!company) return {};
  const prefill: Record<string, string> = {};
  if (company.name?.trim()) prefill["companies.name"] = company.name.trim();
  if (company.industry?.trim()) prefill["companies.industry"] = company.industry.trim();
  return prefill;
}

// Post-submit enrichment for ai_journey_pre: adopt the respondent's industry
// answer when their company has none. Never overwrites an existing value and
// never creates companies (free-typed names would pollute the CRM).
export async function backfillCompanyIndustry(
  personId: string,
  fields: SurveyFieldRow[],
  answerRows: { field_id: string; value: string }[],
): Promise<void> {
  const industryField = fields.find((f) => f.config?.maps_to === "companies.industry");
  if (!industryField) return;
  const industry = answerRows.find((a) => a.field_id === industryField.id)?.value.trim();
  if (!industry) return;
  const company = await primaryCompanyOf(personId);
  if (!company || company.industry?.trim()) return;
  await updateCompanies({ industry }).eq("id", company.id);
}
