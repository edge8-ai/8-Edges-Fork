import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import type { Renewal } from "./renewal-vocab";

// A client account's renewal (S.6): when its current agreement comes up, and
// how that went. One live row per company — the partial unique index in
// 20260925110000_account_health.sql holds that — and replacing a renewal
// archives the old row, so the history stays in the table.
//
// A renewal describes the account. There is no owner column on the table and
// none of these reads groups by a person.
//
// A failed read raises: the card and the screen would otherwise say "no
// renewal set", which is a wrong answer about a date someone did set.

const RENEWAL_SELECT = "id, company_id, renews_on, term_months, status, note";

/** The live renewal of one company, or null when none is set. */
export async function getLiveRenewal(companyId: string): Promise<Renewal | null> {
  const rows = mustRows(
    await companyOs.from("renewals").select(RENEWAL_SELECT).eq("company_id", companyId).is("archived_at", null).limit(1),
    "[crm/renewals] live renewal",
  );
  return (rows[0] as Renewal | undefined) ?? null;
}

/** The live renewals of many companies, keyed by company. */
export async function liveRenewalsFor(companyIds: string[]): Promise<Map<string, Renewal>> {
  if (companyIds.length === 0) return new Map();
  const rows = mustRows(
    await companyOs.from("renewals").select(RENEWAL_SELECT).in("company_id", companyIds).is("archived_at", null),
    "[crm/renewals] live renewals",
  ) as Renewal[];
  return new Map(rows.map((r) => [r.company_id, r]));
}
