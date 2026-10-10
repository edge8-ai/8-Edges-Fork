import { selectAffiliateCommissions } from "@/entities/billing";
import { companyOs } from "@/kernel/data/supabase";
import { selectAffiliates } from "@/entities/contacts";
import { selectPersonCompanies } from "@/entities/contacts";
import { one, type Embedded } from "@/kernel/config/embedded";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";
import { settledAs, type CommissionSettlement } from "@/entities/billing";
import { usdOf } from "./revenue-metrics/shared";

// Affiliate aggregator for the Revenue office. An affiliate is EITHER a COMPANY
// (the primary case) or an individual. A company affiliate keeps a contact
// person (affiliates.person_id) as its portal/redemption contact, but the code
// and its work credit belong to the company. Referral linkage lives in the CRM
// three ways and ALL are resolved here:
//   - deals.affiliate_id         → a code tag (Stripe checkout / manual)
//   - deals.referrer_company_id  → the referring company directly
//   - deals.referrer_id          → the referring person directly (e.g. Brad Giles)
//
// Commission rate is a REDEMPTION CHOICE, not a code property: 20% as work
// credit, 10% as cash. A commission is "pending" until the affiliate chooses.

export const WORK_CREDIT_RATE = 0.2;
export const CASH_RATE = 0.1;

export type AffiliateKind = "company" | "person";

// Discriminated identity for an affiliate group — companyId when it is a company
// affiliate, else personId. groupKey is the stable non-null key (companyId ?? personId).
export type AffiliateIdentity = { companyId?: string | null; personId?: string | null };

export type AffiliateCode = {
  id: string;
  code: string;
  programType: string | null;
  active: boolean;
  stripeCouponId: string | null;
  createdAt: string;
};

export type ReferredDeal = {
  id: string;
  title: string | null;
  status: string | null;
  amountCents: number | null;
  currency: string;
  companyName: string | null;
  via: "code" | "referrer";
  proposalUrl: string | null;
};

export type AffiliateCommission = {
  id: string;
  code: string;
  sourceEvent: string;
  sourceRef: string | null;
  grossCents: number;
  rate: number | null;
  commissionCents: number | null;
  redemptionChoice: "work_credit" | "cash" | null;
  chosenAt: string | null;
  paidOut: boolean;
  // "work_credit" when the payout applied the credit to Human Tokens (label
  // "Applied"), "cash" when it was paid out, null while unsettled.
  settledAs: CommissionSettlement;
  notes: string | null;
  createdAt: string;
};

type Totals = {
  accruedGrossCents: number; // sum of every commission's gross
  realizedCents: number; // sum of chosen commission_cents
  unpaidCents: number; // chosen but not yet paid out
  pendingCount: number; // redemption_choice still null
};

export type AffiliateGroup = Totals & {
  groupKey: string; // stable id: companyId for a company affiliate, else personId
  kind: AffiliateKind;
  companyId: string | null;
  personId: string | null; // the (contact) person, if any
  // The name to show: a company affiliate's company name, else the person's
  // name (personName), each falling back to the email the row carries.
  name: string;
  email: string; // primary-contact email for a company affiliate, else person email
  codes: AffiliateCode[];
  active: boolean; // holds at least one active code
  referredDealCount: number;
  referredOpenPipelineCents: number; // open referred deals
};

export type Affiliate360 = Totals & {
  kind: AffiliateKind;
  companyId: string | null;
  personId: string | null;
  name: string;
  email: string;
  codes: AffiliateCode[];
  active: boolean;
  commissions: AffiliateCommission[];
  referredDeals: ReferredDeal[];
};

// Normalize a deal's amount to the USD-preferred figure the rest of the admin
// UI shows (amount_usd_cents when present, else the native amount).
function dealAmount(d: { amount_usd_cents: number | null; amount_cents: number | null; currency: string | null }) {
  const cents = d.amount_usd_cents ?? d.amount_cents;
  const currency = d.amount_usd_cents != null ? "usd" : d.currency ?? "usd";
  return { cents, currency };
}

const OPEN_STATUS = "open";

function emptyTotals(): Totals {
  return { accruedGrossCents: 0, realizedCents: 0, unpaidCents: 0, pendingCount: 0 };
}

function applyCommission(t: Totals, c: { gross_cents: number; commission_cents: number | null; redemption_choice: string | null; payout_id: string | null }) {
  t.accruedGrossCents += c.gross_cents ?? 0;
  if (c.redemption_choice == null) {
    t.pendingCount += 1;
  } else {
    const realized = c.commission_cents ?? 0;
    t.realizedCents += realized;
    if (!c.payout_id) t.unpaidCents += realized;
  }
}

type PersonEmbed = NamedPerson & { id: string; email: string; archived_at: string | null };
type CompanyEmbed = { id: string; name: string | null; archived_at: string | null };

type AffiliateRow = {
  id: string;
  code: string;
  program_type: string | null;
  active: boolean | null;
  stripe_coupon_id: string | null;
  created_at: string;
  person_id: string | null;
  company_id: string | null;
  people: Embedded<PersonEmbed>;
  companies: Embedded<CompanyEmbed>;
};

function toCode(r: { id: string; code: string; program_type: string | null; active: boolean | null; stripe_coupon_id: string | null; created_at: string }): AffiliateCode {
  return {
    id: r.id,
    code: r.code,
    programType: r.program_type,
    active: !!r.active,
    stripeCouponId: r.stripe_coupon_id,
    createdAt: r.created_at,
  };
}

// Resolve each company's portal/display contact: the is_primary contact, else
// the first non-archived linked person. Used to label a company affiliate and
// to target its portal invite / redemption.
async function primaryContactsFor(companyIds: string[]): Promise<Map<string, { personId: string; email: string }>> {
  const map = new Map<string, { personId: string; email: string }>();
  if (!companyIds.length) return map;
  const { data, error: contactsErr } = await selectPersonCompanies("company_id, is_primary, people(id, email, archived_at)")
    .in("company_id", companyIds);
  if (contactsErr) console.error("[company-os/crm] person_companies", contactsErr);
  const byCompany = new Map<string, Array<{ isPrimary: boolean; person: PersonEmbed }>>();
  for (const r of (data ?? []) as Array<{ company_id: string; is_primary: boolean | null; people: Embedded<PersonEmbed> }>) {
    const p = one(r.people);
    if (!p || p.archived_at) continue;
    const list = byCompany.get(r.company_id) ?? [];
    list.push({ isPrimary: !!r.is_primary, person: p });
    byCompany.set(r.company_id, list);
  }
  for (const [cid, list] of byCompany) {
    const chosen = list.find((x) => x.isPrimary) ?? list[0];
    if (chosen) map.set(cid, { personId: chosen.person.id, email: chosen.person.email });
  }
  return map;
}

// Grouped list for /admin/revenue/affiliates. Small table (one row per affiliate
// entity — company or person) so we fetch all sources whole and aggregate in JS.
export async function getAffiliateGroups(): Promise<AffiliateGroup[]> {
  const [{ data: affRows }, { data: commRows }, { data: dealRows }] = await Promise.all([
    selectAffiliates(`id, code, program_type, active, stripe_coupon_id, created_at, person_id, company_id, people(id, ${NAME_COLUMNS}, archived_at), companies(id, name, archived_at)`)
      .order("created_at", { ascending: true }),
    selectAffiliateCommissions("affiliate_id, gross_cents, commission_cents, redemption_choice, payout_id"),
    companyOs.from("deals").select("id, status, amount_cents, amount_usd_cents, currency, referrer_id, referrer_company_id, affiliate_id")
      .or("referrer_id.not.is.null,referrer_company_id.not.is.null,affiliate_id.not.is.null"),
  ]);

  const rows = (affRows ?? []) as AffiliateRow[];
  const companyIds = [...new Set(rows.map((r) => r.company_id).filter(Boolean) as string[])];
  const primaryContacts = await primaryContactsFor(companyIds);

  const codeToGroup = new Map<string, string>(); // affiliate.id -> groupKey
  const personToGroup = new Map<string, string>(); // contact person_id -> groupKey (for referrer_id deals)
  const groups = new Map<string, AffiliateGroup>();

  for (const raw of rows) {
    const isCompany = !!raw.company_id;
    const company = one(raw.companies);
    const person = one(raw.people);
    // Drop rows whose resolved entity is missing or archived.
    if (isCompany ? !company || company.archived_at : !raw.person_id || !person || person.archived_at) continue;

    const groupKey = (raw.company_id ?? raw.person_id) as string;
    codeToGroup.set(raw.id, groupKey);
    if (raw.person_id) personToGroup.set(raw.person_id, groupKey);

    let g = groups.get(groupKey);
    if (!g) {
      const primary = isCompany ? primaryContacts.get(raw.company_id as string) : null;
      const email = isCompany ? primary?.email ?? person?.email ?? "" : person?.email ?? "";
      g = {
        ...emptyTotals(),
        groupKey,
        kind: isCompany ? "company" : "person",
        companyId: raw.company_id ?? null,
        personId: isCompany ? primary?.personId ?? raw.person_id ?? null : raw.person_id,
        name: isCompany ? company?.name?.trim() || email : personName(person, email),
        email,
        codes: [],
        active: false,
        referredDealCount: 0,
        referredOpenPipelineCents: 0,
      };
      groups.set(groupKey, g);
    }
    g.codes.push(toCode(raw));
    if (raw.active) g.active = true;
  }

  for (const c of (commRows ?? []) as Array<{ affiliate_id: string; gross_cents: number; commission_cents: number | null; redemption_choice: string | null; payout_id: string | null }>) {
    const key = codeToGroup.get(c.affiliate_id);
    const g = key ? groups.get(key) : undefined;
    if (g) applyCommission(g, c);
  }

  for (const d of (dealRows ?? []) as Array<{ id: string; status: string | null; amount_cents: number | null; amount_usd_cents: number | null; currency: string | null; referrer_id: string | null; referrer_company_id: string | null; affiliate_id: string | null }>) {
    // Attribution precedence: code tag, then direct company referral, then
    // direct person referral. Each deal counts once, toward a single group.
    const key =
      (d.affiliate_id && codeToGroup.get(d.affiliate_id)) ||
      (d.referrer_company_id && groups.has(d.referrer_company_id) ? d.referrer_company_id : null) ||
      (d.referrer_id && personToGroup.get(d.referrer_id)) ||
      null;
    const g = key ? groups.get(key) : undefined;
    if (!g) continue;
    g.referredDealCount += 1;
    // A sum shown in USD, so a deal with no USD value adds nothing: its native
    // amount, which dealAmount shows row by row with its own currency, would be
    // A$ counted as US$ here.
    if (d.status === OPEN_STATUS) g.referredOpenPipelineCents += usdOf(d);
  }

  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Full 360 for one affiliate (company or person) — powers the admin shelf and
// (reshaped) the client-portal Referrals page.
export async function getAffiliate360(identity: AffiliateIdentity): Promise<Affiliate360 | null> {
  const companyId = identity.companyId ?? null;
  const personId = identity.personId ?? null;
  if (!companyId && !personId) return null;

  let kind: AffiliateKind;
  let name: string;
  let email: string;
  let contactPersonId: string | null = personId;

  if (companyId) {
    const { data: company, error: companyErr } = await companyOs.from("companies").select("id, name").eq("id", companyId).maybeSingle();
    if (companyErr) console.error("[company-os/crm] companies", companyErr);
    if (!company) return null;
    kind = "company";
    const primary = (await primaryContactsFor([companyId])).get(companyId);
    contactPersonId = primary?.personId ?? personId ?? null;
    email = primary?.email ?? "";
    name = (company.name as string | null)?.trim() || email;
  } else {
    const { data: person, error: personErr } = await companyOs.from("people").select(`id, ${NAME_COLUMNS}`).eq("id", personId as string).maybeSingle();
    if (personErr) console.error("[company-os/crm] people", personErr);
    if (!person) return null;
    kind = "person";
    email = (person.email as string) ?? "";
    name = personName(person as NamedPerson, email);
    contactPersonId = person.id as string;
  }

  const codeQuery = selectAffiliates("id, code, program_type, active, stripe_coupon_id, created_at")
    .order("created_at", { ascending: true });
  const { data: affRows, error: affErr } = await (companyId ? codeQuery.eq("company_id", companyId) : codeQuery.eq("person_id", personId as string));
  if (affErr) console.error("[company-os/crm] affiliates", affErr);
  const codes = (affRows ?? []) as Array<{ id: string; code: string; program_type: string | null; active: boolean | null; stripe_coupon_id: string | null; created_at: string }>;
  const codeIds = codes.map((c) => c.id);
  const codeById = new Map(codes.map((c) => [c.id, c.code] as const));

  // Referred deals: code-tagged, or directly referred by this company / contact.
  const dealOrParts: string[] = [];
  if (companyId) dealOrParts.push(`referrer_company_id.eq.${companyId}`);
  if (contactPersonId) dealOrParts.push(`referrer_id.eq.${contactPersonId}`);
  if (codeIds.length) dealOrParts.push(`affiliate_id.in.(${codeIds.join(",")})`);

  const [{ data: commRows }, { data: dealRows }] = await Promise.all([
    codeIds.length
      ? selectAffiliateCommissions("id, affiliate_id, source_event, source_ref, gross_cents, rate, commission_cents, redemption_choice, chosen_at, payout_id, notes, created_at, payout:affiliate_payouts!payout_id(method)")
          .in("affiliate_id", codeIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    dealOrParts.length
      ? companyOs.from("deals").select("id, title, status, amount_cents, amount_usd_cents, currency, referrer_id, affiliate_id, proposal_url, companies!company_id(name)")
          .or(dealOrParts.join(","))
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const totals = emptyTotals();
  const commissions: AffiliateCommission[] = ((commRows ?? []) as Array<{ id: string; affiliate_id: string; source_event: string; source_ref: string | null; gross_cents: number; rate: number | null; commission_cents: number | null; redemption_choice: string | null; chosen_at: string | null; payout_id: string | null; notes: string | null; created_at: string; payout: Embedded<{ method: string | null }> }>).map((c) => {
    applyCommission(totals, c);
    return {
      id: c.id,
      code: codeById.get(c.affiliate_id) ?? "—",
      sourceEvent: c.source_event,
      sourceRef: c.source_ref,
      grossCents: c.gross_cents,
      rate: c.rate,
      commissionCents: c.commission_cents,
      redemptionChoice: (c.redemption_choice as "work_credit" | "cash" | null) ?? null,
      chosenAt: c.chosen_at,
      paidOut: !!c.payout_id,
      settledAs: settledAs(c.payout_id, one(c.payout)?.method ?? null),
      notes: c.notes,
      createdAt: c.created_at,
    };
  });

  const referredDeals: ReferredDeal[] = ((dealRows ?? []) as Array<{ id: string; title: string | null; status: string | null; amount_cents: number | null; amount_usd_cents: number | null; currency: string | null; referrer_id: string | null; affiliate_id: string | null; proposal_url: string | null; companies: Embedded<{ name: string | null }> }>).map((d) => {
    const { cents, currency } = dealAmount(d);
    return {
      id: d.id,
      title: d.title,
      status: d.status,
      amountCents: cents,
      currency,
      companyName: one(d.companies)?.name ?? null,
      via: d.affiliate_id && codeById.has(d.affiliate_id) ? "code" : "referrer",
      proposalUrl: d.proposal_url ?? null,
    };
  });

  return {
    ...totals,
    kind,
    companyId,
    personId: contactPersonId,
    name,
    email,
    codes: codes.map(toCode),
    active: codes.some((c) => c.active),
    commissions,
    referredDeals,
  };
}

// Deterministic code from a name (a company name for a company affiliate, else a
// person name): uppercase alphanumerics, capped, numeric suffix on collision.
// Mirrors the shape of the codes already issued: a surname, a first name,
// or a company name, uppercased.
export async function generateAffiliateCode(name: string | null, email: string): Promise<string> {
  const base = (name || email.split("@")[0] || "AFFILIATE")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16) || "AFFILIATE";
  const { data, error: codesErr } = await selectAffiliates("code").ilike("code", `${base}%`);
  if (codesErr) console.error("[company-os/crm] affiliates", codesErr);
  const taken = new Set(((data ?? []) as Array<{ code: string }>).map((r) => r.code.toUpperCase()));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}${Date.now().toString().slice(-4)}`;
}
