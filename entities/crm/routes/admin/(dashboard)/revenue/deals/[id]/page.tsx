import { requirePermission } from "@/kernel/identity/access-request";
import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import { cache } from "react";
import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { companyOs } from "@/kernel/data/supabase";
import { PageHead } from "@/kernel/ui/PageHead";
import { surfaceBase } from "@/kernel/shell/surface";
import { dealSlug, isShortCode, isUuid, shortCodeRange, shortOf } from "@/kernel/config/slug";
import { DealManage, type DealManageData, type DealStage } from "../DealManage";
import { one, type Embedded } from "@/kernel/config/embedded";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";
import { listCampaignOptions } from "@/entities/campaigns";
import { readDealStageHistory } from "@/entities/crm/lib/deal-stage";
import { getInvoicesForCompany } from "@/entities/crm/lib/invoices";
import { DealAttribution } from "./DealAttribution";
import { DealBilling } from "./DealBilling";
import { AgreementCard } from "./AgreementCard";
import { agreementView, type AgreementView } from "./agreement-view";
import { listAgreementsForDeal } from "@/entities/crm/lib/agreements";
import { DealHistory } from "./DealHistory";
import { readAuditPage } from "@/kernel/audit/history-read";
import { RecordHistoryList } from "@/kernel/ui/RecordHistory";

// A stale read here would show an old stage or a restored/archived state that no
// longer matches the DB, so never serve this from the data cache.
type PersonEmbed = NamedPerson;
type CompanyEmbed = { name: string | null };

type RefRow = {
  id: string;
  title: string | null;
  people: Embedded<PersonEmbed>;
  companies: Embedded<CompanyEmbed>;
};

// Label a deal for its slug: its own title, else the contact, else the company.
function labelOf(row: RefRow): string | null {
  const p = one(row.people);
  const co = one(row.companies);
  return row.title || personName(p, null) || co?.name || null;
}

type DealRef = {
  id: string;
  label: string | null;
  canonical: string;
  redirect: "permanent" | "temporary" | null;
};

// Kept distinct on purpose: a DB error must not masquerade as a missing row, so a
// transient timeout never tells the closer the deal was deleted.
type DealRefResult =
  | { kind: "ok"; ref: DealRef }
  | { kind: "error"; message: string }
  | { kind: "notfound" };

const REF_SELECT = `id, title, people!person_id(${NAME_COLUMNS}), companies!company_id(name)`;

// Resolve a URL segment — a name+short-code slug like "accord-plumbing-1a2b3c4d",
// or a legacy full uuid — to the deal row. Wrapped in cache() so generateMetadata
// and the page body share one DB round-trip per request.
const resolveDealRef = cache(async (segment: string): Promise<DealRefResult> => {
  if (isUuid(segment)) {
    const { data, error } = await companyOs.from("deals").select(REF_SELECT).eq("id", segment).maybeSingle();
    if (error) return { kind: "error", message: error.message };
    const row = data as unknown as RefRow | null;
    if (!row) return { kind: "notfound" };
    const label = labelOf(row);
    return { kind: "ok", ref: { id: row.id, label, canonical: dealSlug(label, row.id), redirect: "permanent" } };
  }

  // Slug: the trailing hyphen group is the 8-hex short code. PostgREST can't ILIKE
  // a uuid column, so match the code with an index-friendly uuid range instead.
  const short = shortOf(segment);
  if (!isShortCode(short)) return { kind: "notfound" };
  const { lo, hi } = shortCodeRange(short);
  const { data, error } = await companyOs.from("deals").select(REF_SELECT).gte("id", lo).lte("id", hi).limit(2);
  if (error) return { kind: "error", message: error.message };
  const rows = (data as unknown as RefRow[] | null) ?? [];
  if (rows.length === 0) return { kind: "notfound" };

  let row = rows[0];
  if (rows.length > 1) {
    // Astronomically rare 32-bit collision: keep only the row whose canonical slug
    // is exactly what was requested; if none, we can't safely disambiguate.
    const exact = rows.find((r) => dealSlug(labelOf(r), r.id) === segment);
    if (!exact) return { kind: "notfound" };
    row = exact;
  }
  const label = labelOf(row);
  const canonical = dealSlug(label, row.id);
  return { kind: "ok", ref: { id: row.id, label, canonical, redirect: segment === canonical ? null : "temporary" } };
});

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const params = await props.params;
  const resolved = await resolveDealRef(params.id);
  return { title: resolved.kind === "ok" ? resolved.ref.label ?? "Deal" : "Deal" };
}

type Stage = { id: string; name: string; position: number; is_won: boolean; is_lost: boolean };

type FullRow = {
  id: string;
  title: string | null;
  stage_id: string | null;
  status: string | null;
  amount_cents: number | null;
  amount_usd_cents: number | null;
  currency: string | null;
  probability: number | null;
  expected_close_date: string | null;
  source: string | null;
  person_id: string | null;
  company_id: string | null;
  next_step: string | null;
  next_step_date: string | null;
  proposal_url: string | null;
  contract_url: string | null;
  handoff_status: string | null;
  lost_reason: string | null;
  archived_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  closed_at: string | null;
  referrer_id: string | null;
  referrer_company_id: string | null;
  campaign_id: string | null;
  people: Embedded<PersonEmbed>;
  companies: Embedded<CompanyEmbed>;
  referrer: Embedded<PersonEmbed>;
  referrer_company: Embedded<CompanyEmbed>;
  owner: Embedded<PersonEmbed>;
};

const FULL_SELECT =
  `id, title, stage_id, status, amount_cents, amount_usd_cents, currency, probability, expected_close_date, source, person_id, company_id, next_step, next_step_date, proposal_url, contract_url, handoff_status, lost_reason, archived_at, created_at, updated_at, closed_at, referrer_id, referrer_company_id, campaign_id, people!person_id(${NAME_COLUMNS}), companies!company_id(name), referrer:people!referrer_id(${NAME_COLUMNS}), referrer_company:companies!referrer_company_id(name), owner:people!owner_id(${NAME_COLUMNS})`;

export default async function DealDetailPage(props: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("crm.pipeline");
  const params = await props.params;
  const surface = await surfaceBase();
  const resolved = await resolveDealRef(params.id);
  if (resolved.kind === "error") {
    return (
      <>
        <PageHead eyebrow={<Link href="/admin/revenue/deals">← Deals</Link>} title="Deal" />
        <div className="admin-alert admin-alert--err">{resolved.message}</div>
      </>
    );
  }
  if (resolved.kind === "notfound") notFound();
  const ref = resolved.ref;
  // A legacy uuid link is permanently canonicalized; a stale-name slug (the deal
  // was renamed) redirects temporarily, since the name can change again.
  if (ref.redirect === "permanent") permanentRedirect(`${surface}/revenue/deals/${ref.canonical}`);
  if (ref.redirect === "temporary") redirect(`${surface}/revenue/deals/${ref.canonical}`);

  const [{ data, error }, { data: stageData }, history, campaignOptions, recordHistory] = await Promise.all([
    companyOs.from("deals").select(FULL_SELECT).eq("id", ref.id).maybeSingle(),
    companyOs.from("pipeline_stages").select("id, name, position, is_won, is_lost").order("position"),
    readDealStageHistory(ref.id),
    listCampaignOptions(),
    // Who changed this deal, and when (S.4). The stage log beside it answers a
    // narrower question — where the deal has been in the pipeline — and the
    // audit trail answers every other write.
    readAuditPage("deals", ref.id, 0, 20),
  ]);

  if (error) {
    return (
      <>
        <PageHead eyebrow={<Link href="/admin/revenue/deals">← Deals</Link>} title="Deal" />
        <div className="admin-alert admin-alert--err">{error.message}</div>
      </>
    );
  }
  if (!data) notFound();

  const r = data as unknown as FullRow;
  const p = one(r.people);
  const co = one(r.companies);
  const rf = one(r.referrer);
  const rc = one(r.referrer_company);
  const owner = one(r.owner);

  const deal: DealManageData = {
    id: r.id,
    title: r.title,
    personId: r.person_id,
    contactName: personName(p, null),
    companyId: r.company_id,
    companyName: co?.name ?? null,
    stageId: r.stage_id,
    status: r.status,
    amountCents: r.amount_cents,
    amountUsdCents: r.amount_usd_cents,
    currency: r.currency,
    probability: r.probability,
    expectedClose: r.expected_close_date,
    source: r.source,
    nextStep: r.next_step,
    nextStepDate: r.next_step_date,
    proposalUrl: r.proposal_url,
    contractUrl: r.contract_url,
    handoffStatus: r.handoff_status ?? "none",
    lostReason: r.lost_reason,
    archivedAt: r.archived_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    closedAt: r.closed_at,
    referrerId: r.referrer_id,
    referrerName: personName(rf, null),
    referrerCompanyId: r.referrer_company_id,
    referrerCompanyName: rc?.name ?? null,
    ownerName: personName(owner, null),
  };

  const stages: DealStage[] = ((stageData as Stage[] | null) ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    isWon: s.is_won,
    isLost: s.is_lost,
  }));

  // The Revenue hub's joins, visible where they are set (RH-2): the campaign
  // this deal is attributed to, the invoices that bill it, and its stage log.
  const invoices = r.company_id ? await getInvoicesForCompany(r.company_id) : [];
  // Agreements to sign (E-signature). A failed read costs this card, not the
  // deal page, and says so rather than showing an empty list.
  const agreements = await listAgreementsForDeal(r.id)
    .then((list) => Promise.all(list.map(agreementView)))
    .catch((e: unknown): AgreementView[] | string => (e instanceof Error ? e.message : String(e)));
  // The same question the agreement actions ask, so a role granted
  // crm.agreements sees the controls it may use.
  const canManageAgreements = access.may("crm.agreements");
  const stageNames = new Map(stages.map((s) => [s.id, s.name]));
  return (
    <>
      <DealManage deal={deal} stages={stages} />
      <div className="admin-summary-grid u-mt-4">
        <DealAttribution dealId={r.id} campaignId={r.campaign_id} options={campaignOptions} />
        <DealHistory rows={history} stageNames={stageNames} />
        <div className="admin-card admin-section-card">
          <div className="admin-kpi-label u-mb-2">Record history</div>
          {recordHistory.ok ? (
            <RecordHistoryList entries={recordHistory.page.entries} />
          ) : (
            <div className="admin-empty">History could not be read: {recordHistory.error}</div>
          )}
        </div>
      </div>
      <div className="u-mt-4">
        <DealBilling dealId={r.id} dealAmountCents={r.amount_cents} dealCurrency={r.currency} invoices={invoices} />
      </div>
      <div className="u-mt-4">
        {typeof agreements === "string" ? (
          <div className="admin-card admin-section-card">
            <div className="admin-kpi-label u-mb-2">Agreements</div>
            <div className="admin-alert admin-alert--err">Agreements could not be read: {agreements}</div>
          </div>
        ) : (
          <AgreementCard dealId={r.id} dealCurrency={r.currency} agreements={agreements} canManage={canManageAgreements} />
        )}
      </div>
    </>
  );
}
