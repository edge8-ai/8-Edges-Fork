import { selectAffiliateCommissions } from "@/entities/billing";
import { companyOs } from "@/kernel/data/supabase";
import { selectAffiliates } from "@/entities/contacts";
import { selectPersonCompanies } from "@/entities/contacts";
import { one, type Embedded } from "@/kernel/config/embedded";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

// Company detail aggregator: the account record plus its linked deals and
// people. Related reads are tolerant (a denied/empty table yields []).

export type Company = {
  id: string;
  name: string | null;
  website_url: string | null;
  industry: string | null;
  industry_normalized: string | null;
  size_band: string | null;
  country: string | null;
  priority: string | null;
  lifecycle_stage: string;
  notes: string | null;
  billing_address: string | null;
  archived_at: string | null;
  archived_by: string | null;
  created_at: string;
  updated_at: string | null;
  client_start_date: string | null;
  client_end_date: string | null;
};

export type CompanyAffiliate = {
  affiliateId: string | null; // active code's row id, else first
  active: boolean;
  code: string | null;
  accruedGrossCents: number;
  realizedCents: number;
  unpaidCents: number;
  pendingCount: number;
  referredDealCount: number;
};

export type Company360 = {
  company: Company;
  deals: Array<{ id: string; title: string | null; amount_cents: number | null; amount_usd_cents: number | null; currency: string | null; status: string | null; proposal_url: string | null; created_at: string }>;
  people: Array<{ id: string; name: string; full_name: string | null; email: string; affiliateActive: boolean; affiliateCode: string | null }>;
  affiliate: CompanyAffiliate | null; // set when THIS company is itself an affiliate
};

async function safe<T>(p: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const { data, error: error } = await p;
  if (error) console.error("[company-os/crm] company 360 related read", error);
  return data ?? [];
}

export async function getCompany360(id: string): Promise<Company360 | null> {
  const res = await companyOs.from("companies").select("*").eq("id", id).maybeSingle();
  if (res.error || !res.data) return null;
  const company = res.data as Company;

  const [deals, links] = await Promise.all([
    safe(
      companyOs.from("deals").select("id, title, amount_cents, amount_usd_cents, currency, status, proposal_url, created_at")
        .eq("company_id", id)
        .order("created_at", { ascending: false }),
    ),
    safe(
      selectPersonCompanies(`people(id, ${NAME_COLUMNS})`)
        .eq("company_id", id),
    ),
  ]);

  type LinkedPerson = { id: string } & NamedPerson & { email: string };
  const linkedPeople = (links as Array<{ people: Embedded<LinkedPerson> }>)
    .map((l) => one(l.people))
    .filter((p): p is LinkedPerson => !!p);

  // Affiliate status per contact, so the shelf can activate/deactivate them.
  const personIds = linkedPeople.map((p) => p.id);
  const affiliates = personIds.length
    ? await safe(
        selectAffiliates("person_id, code, active").in("person_id", personIds),
      )
    : [];
  const affByPerson = new Map<string, { code: string; active: boolean }[]>();
  for (const a of affiliates as Array<{ person_id: string; code: string; active: boolean | null }>) {
    const list = affByPerson.get(a.person_id) ?? [];
    list.push({ code: a.code, active: !!a.active });
    affByPerson.set(a.person_id, list);
  }

  const people = linkedPeople.map((p) => {
    const codes = affByPerson.get(p.id) ?? [];
    const activeCode = codes.find((c) => c.active);
    return {
      id: p.id,
      name: personName(p),
      full_name: p.full_name ?? null,
      email: p.email,
      affiliateActive: !!activeCode,
      affiliateCode: activeCode?.code ?? codes[0]?.code ?? null,
    };
  });

  // Company-level affiliate: is THIS company itself an affiliate, and what are
  // its commission totals? Codes/commissions hang off affiliates.id; the work
  // credit belongs to the company.
  const companyAffRows = (await safe(
    selectAffiliates("id, code, active").eq("company_id", id),
  )) as Array<{ id: string; code: string; active: boolean | null }>;
  let affiliate: CompanyAffiliate | null = null;
  if (companyAffRows.length) {
    const affIds = companyAffRows.map((a) => a.id);
    const activeRow = companyAffRows.find((a) => a.active) ?? companyAffRows[0];
    const [comms, referred] = await Promise.all([
      safe(selectAffiliateCommissions("gross_cents, commission_cents, redemption_choice, payout_id").in("affiliate_id", affIds)),
      safe(companyOs.from("deals").select("id").or(`affiliate_id.in.(${affIds.join(",")}),referrer_company_id.eq.${id}`)),
    ]);
    let accruedGrossCents = 0, realizedCents = 0, unpaidCents = 0, pendingCount = 0;
    for (const c of comms as Array<{ gross_cents: number; commission_cents: number | null; redemption_choice: string | null; payout_id: string | null }>) {
      accruedGrossCents += c.gross_cents ?? 0;
      if (c.redemption_choice == null) pendingCount += 1;
      else {
        const realized = c.commission_cents ?? 0;
        realizedCents += realized;
        if (!c.payout_id) unpaidCents += realized;
      }
    }
    affiliate = {
      affiliateId: activeRow?.id ?? null,
      active: companyAffRows.some((a) => a.active),
      code: activeRow?.code ?? null,
      accruedGrossCents,
      realizedCents,
      unpaidCents,
      pendingCount,
      referredDealCount: referred.length,
    };
  }

  return {
    company,
    deals: deals as Company360["deals"],
    people,
    affiliate,
  };
}

// Who referred this company's deals — resolved from both referral paths on
// deals (referrer_id = a person; affiliate_id = a code). Distinct display
// names, for the "Referred by" line on the company profile.
export async function getCompanyReferredBy(companyId: string): Promise<string[]> {
  const rows = await safe(
    companyOs.from("deals").select("referrer_id, referrer_company_id, affiliate_id").eq("company_id", companyId),
  );
  const referrerIds = [...new Set(rows.map((r) => (r as { referrer_id: string | null }).referrer_id).filter(Boolean) as string[])];
  const referrerCompanyIds = [...new Set(rows.map((r) => (r as { referrer_company_id: string | null }).referrer_company_id).filter(Boolean) as string[])];
  const affiliateIds = [...new Set(rows.map((r) => (r as { affiliate_id: string | null }).affiliate_id).filter(Boolean) as string[])];

  const names = new Set<string>();
  if (referrerIds.length) {
    const people = await safe(companyOs.from("people").select(`${NAME_COLUMNS}`).in("id", referrerIds));
    for (const p of people as Array<(NamedPerson & { email: string })>) names.add(personName(p));
  }
  if (referrerCompanyIds.length) {
    const companies = await safe(companyOs.from("companies").select("name").in("id", referrerCompanyIds));
    for (const c of companies as Array<{ name: string | null }>) if (c.name) names.add(c.name);
  }
  if (affiliateIds.length) {
    const affs = await safe(selectAffiliates(`code, people(${NAME_COLUMNS}), companies(name)`).in("id", affiliateIds));
    for (const a of affs as Array<{ code: string; people: Embedded<NamedPerson>; companies: Embedded<{ name: string | null }> }>) {
      const p = one(a.people);
      const co = one(a.companies);
      names.add(co?.name || personName(p, null) || a.code);
    }
  }
  return [...names];
}

// The proposals written for a set of companies: every deal carrying a
// proposal link, newest first. Title, date and link only, so the client
// portal can list them without seeing deal amounts or stages.
export type CompanyProposal = { id: string; title: string | null; proposalUrl: string; createdAt: string };

export async function listProposalsForCompanies(companyIds: string[]): Promise<CompanyProposal[]> {
  if (companyIds.length === 0) return [];
  const { data, error } = await companyOs.from("deals").select("id, title, proposal_url, created_at")
    .in("company_id", companyIds)
    .not("proposal_url", "is", null)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[company-os/crm] proposals read", error);
    return [];
  }
  return ((data ?? []) as Array<{ id: string; title: string | null; proposal_url: string; created_at: string }>).map((d) => ({
    id: d.id,
    title: d.title,
    proposalUrl: d.proposal_url,
    createdAt: d.created_at,
  }));
}
