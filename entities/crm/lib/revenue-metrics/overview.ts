import { selectLead, selectInquiries, selectPipelineStages } from "@/entities/crm/lib/reads";
import { dealsForOverview, type OverviewDeal, type OverviewDealRow } from "./deals";
import { isOutstanding, isVoided, liveInvoices } from "@/entities/finance";
import { orderFigures } from "@/entities/billing";
import { personName } from "@/kernel/config/people-name";
import { businessDate, diffDays } from "@/kernel/config/dates";
import { ACTIVE_LEAD_STATUSES, NON_SALES_INQUIRY_TYPES } from "@/entities/crm/lib/lifecycle";
import { cents, collectErrors, compared, dealState, invoiceBalanceUsd, invoiceUsd, lastMonths, monthKey, monthLabel, usdOf, type Compared, type Loaded, type MonthPoint } from "./shared";

// The Overview tab's figures (2026-09-13): what used to be six hundred lines
// of maths inside the cockpit page, moved here so it is tested, shares the
// pipeline module's dollar rule (usdOf) with every other tab, and no longer
// disagrees with the Pipeline tab about what "open pipeline" is.
//
// Revenue is cash documents: non-voided invoices by invoice date plus paid
// Stripe orders, all USD. Won is deal value by close date. Both are figures
// about the business; nothing here is sliced by owner.
//
// "All USD" is now enforced rather than assumed (RF-2 review): an invoice in
// another currency has no USD figure on the mirror, and this tab used to add
// its native amount at par — so one AUD 1,500,000 invoice read as $15,000 of
// US revenue. It contributes nothing now, which is also what the Billing tab
// does, so the two tabs of one hub cannot report different totals.

export type { OverviewDeal };
export type OverviewStage = { id: string; name: string; position: number; is_won: boolean; is_lost: boolean };
export type OverviewInvoice = { txn_date: string | null; amount_cents: number | null; amount_usd_cents: number | null; balance_cents: number | null; balance_usd_cents: number | null; currency: string | null; status: string | null; entity: string; kind?: string | null };
export type OverviewOrder = { created_at: string; amount_usd_cents: number | null; status: string | null };
export type OverviewLead = { created_at: string; status?: string | null; sla_due_at?: string | null };

export type AttentionDeal = { id: string; title: string; stage: string; usd: number | null; nextStep: string | null; gaps: string[] };
export type FunnelStep = { label: string; value: number };
/**
 * An open deal that needs a move today (RT.1): its next step is due or late,
 * or it has no next step or no date. Revenue today and the Deals page list
 * them closest to signing first (the stage's place in the pipeline), then
 * biggest, so the deal nearest to money is the first thing done.
 */
export type CloseDeal = {
  id: string;
  title: string;
  stage: string;
  stagePosition: number;
  usd: number | null;
  nextStep: string | null;
  nextStepDate: string | null;
  /** Days past the next step's date; 0 when due today or not dated. */
  lateDays: number;
  /** Why it is on the list. */
  reason: "late" | "today" | "no-date" | "no-step";
};

/** One open deal, as the ranking needs it. `usd` is whole dollars. */
export type ToCloseIn = { id: string; title: string; stageId: string | null; usd: number | null; nextStep: string | null; nextStepDate: string | null };

/**
 * The open deals that need a move today, closest to signing first (the
 * stage's place in the pipeline), then biggest, then latest. Revenue today
 * and the Deals page share it, so both lists agree.
 */
export function rankToClose(open: ToCloseIn[], stages: Pick<OverviewStage, "id" | "name" | "position">[], today: string): CloseDeal[] {
  const stageById = new Map(stages.map((s) => [s.id, s]));
  return open
    .map((d): CloseDeal | null => {
      const reason: CloseDeal["reason"] | null = !d.nextStep ? "no-step" : !d.nextStepDate ? "no-date" : d.nextStepDate < today ? "late" : d.nextStepDate === today ? "today" : null;
      if (!reason) return null;
      const stage = d.stageId ? stageById.get(d.stageId) : undefined;
      return {
        id: d.id,
        title: d.title,
        stage: stage?.name ?? "—",
        stagePosition: stage?.position ?? -1,
        usd: d.usd,
        nextStep: d.nextStep,
        nextStepDate: d.nextStepDate,
        lateDays: reason === "late" ? diffDays(d.nextStepDate!.slice(0, 10), today) : 0,
        reason,
      };
    })
    .filter((d): d is CloseDeal => d !== null)
    .sort((a, b) => b.stagePosition - a.stagePosition || (b.usd ?? 0) - (a.usd ?? 0) || b.lateDays - a.lateDays);
}

export type OverviewMetrics = Loaded & {
  revenue12m: Compared;
  revenueYtd: number;
  revenueYtdByEntity: { entity: string; usd: number }[];
  revenueByMonth: MonthPoint<{ count: number; usd: number; recurring: number }>[];
  wonYtd: number;
  arOutstanding: number;
  openPipeline: number;
  openWeighted: number;
  openCount: number;
  newLeads30: Compared;
  slaOverdue: number;
  funnel30: FunnelStep[];
  conversion90: number | null;
  needsAttention: AttentionDeal[];
  toClose: CloseDeal[];
  /** Open deals with a dated next step still ahead. */
  onTrack: number;
  /** The pipeline's won and lost stages, for Won and Lost on a deal's row. */
  wonStageId: string | null;
  lostStageId: string | null;
};

// The four things a deal needs before anyone can act on it. A missing owner
// is a completeness gap of the record, not a figure about a person.
export function dealGaps(d: { owner_id: string | null; amount_usd_cents: number | null; amount_cents: number | null; currency: string | null; next_step: string | null; next_step_date: string | null }): string[] {
  const gaps: string[] = [];
  if (!d.owner_id) gaps.push("Owner");
  if (usdOf(d) <= 0) gaps.push("Value");
  if (!d.next_step) gaps.push("Next step");
  if (!d.next_step_date) gaps.push("Date");
  return gaps;
}

export type OverviewInputs = { deals: OverviewDeal[]; stages: OverviewStage[]; invoices: OverviewInvoice[]; orders: OverviewOrder[]; leads90: OverviewLead[]; activeLeads: OverviewLead[]; inquiries30: number; errors?: string[] };

export function aggregateOverview(input: OverviewInputs, now: Date): OverviewMetrics {
  const { deals, stages, invoices, orders } = input;
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const ms = 86_400_000;
  const nowIso = now.toISOString();
  const tomorrow = day(new Date(now.getTime() + ms));
  const d365 = day(new Date(now.getTime() - 365 * ms));
  const d730 = day(new Date(now.getTime() - 730 * ms));
  const yearStart = `${now.getUTCFullYear()}-01-01`;
  const iso30 = new Date(now.getTime() - 30 * ms).toISOString();
  const iso60 = new Date(now.getTime() - 60 * ms).toISOString();
  const iso90 = new Date(now.getTime() - 90 * ms).toISOString();

  const stageById = new Map(stages.map((s) => [s.id, s]));
  const live = deals.filter((d) => !d.archived_at);
  // Won and closed are shared.ts's definition, not this tab's. The seam exists
  // so the four tabs cannot disagree about which deals are won; restating the
  // predicate here is how they start to.
  const { isWon, isClosed } = dealState(stages);
  const open = live.filter((d) => !isClosed(d));

  const cash = invoices.filter((i) => !isVoided(i.status) && i.txn_date);
  const paid = orders.filter((o) => o.status === "paid");
  const invoiceCash = (from: string, to: string, entity?: string) => cash.reduce((s, i) => (i.txn_date! >= from && i.txn_date! < to && (!entity || i.entity === entity) ? s + invoiceUsd(i) : s), 0);
  const stripeCash = (from: string, to: string) => paid.reduce((s, o) => (o.created_at.slice(0, 10) >= from && o.created_at.slice(0, 10) < to ? s + cents(o.amount_usd_cents) : s), 0);
  const cashBetween = (from: string, to: string) => invoiceCash(from, to) + stripeCash(from, to);
  const dollars = (c: number) => Math.round(c / 100);

  const entities = [...new Set(cash.map((i) => i.entity))].sort();
  const months = lastMonths(now.getUTCMonth() + 1, now);
  const revenueByMonth = months.map((month) => {
    const from = `${month}-01`;
    const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1));
    const to = day(next);
    const inv = cash.filter((i) => i.txn_date! >= from && i.txn_date! < to);
    return {
      month,
      label: monthLabel(month),
      count: inv.length,
      usd: dollars(cashBetween(from, to)),
      recurring: dollars(inv.filter((i) => i.kind === "recurring").reduce((s, i) => s + invoiceUsd(i), 0)),
    };
  });

  const newLeadDates = input.leads90.map((l) => l.created_at);
  const leads30 = newLeadDates.filter((d) => d >= iso30).length;
  const leadsPrev30 = newLeadDates.filter((d) => d >= iso60 && d < iso30).length;
  const won90 = live.filter((d) => isWon(d) && d.closed_at && d.closed_at >= iso90).length;
  const leads90 = newLeadDates.length;

  const needsAttention: AttentionDeal[] = open
    .map((d) => ({ d, gaps: dealGaps(d) }))
    .filter((x) => x.gaps.length > 0)
    .sort((a, b) => usdOf(b.d) - usdOf(a.d))
    .map(({ d, gaps }) => ({
      id: d.id,
      title: d.title || d.company_name || d.person_name || "Untitled deal",
      stage: d.stage_id ? stageById.get(d.stage_id)?.name ?? "—" : "—",
      usd: usdOf(d) > 0 ? usdOf(d) : null,
      nextStep: d.next_step,
      gaps,
    }));

  const today = businessDate(now);
  const toClose = rankToClose(
    open.map((d) => ({ id: d.id, title: d.title || d.company_name || d.person_name || "Untitled deal", stageId: d.stage_id, usd: usdOf(d) > 0 ? dollars(usdOf(d)) : null, nextStep: d.next_step, nextStepDate: d.next_step_date })),
    stages,
    businessDate(now),
  );

  return {
    toClose,
    onTrack: open.length - toClose.length,
    wonStageId: stages.find((s) => s.is_won)?.id ?? null,
    lostStageId: stages.find((s) => s.is_lost)?.id ?? null,
    errors: input.errors ?? [],
    revenue12m: compared(dollars(cashBetween(d365, tomorrow)), dollars(cashBetween(d730, d365))),
    revenueYtd: dollars(cashBetween(yearStart, tomorrow)),
    revenueYtdByEntity: entities.map((entity) => ({ entity, usd: dollars(invoiceCash(yearStart, tomorrow, entity) + (entity === entities[0] ? stripeCash(yearStart, tomorrow) : 0)) })),
    revenueByMonth,
    wonYtd: dollars(live.filter((d) => isWon(d) && (d.closed_at ?? "") >= yearStart).reduce((s, d) => s + usdOf(d), 0)),
    arOutstanding: dollars(invoices.filter((i) => isOutstanding(i.status)).reduce((s, i) => s + invoiceBalanceUsd(i), 0)),
    openPipeline: dollars(open.reduce((s, d) => s + usdOf(d), 0)),
    openWeighted: dollars(open.reduce((s, d) => s + (usdOf(d) * cents(d.probability)) / 100, 0)),
    openCount: open.length,
    newLeads30: compared(leads30, leadsPrev30),
    slaOverdue: input.activeLeads.filter((l) => l.sla_due_at && l.sla_due_at < nowIso).length,
    funnel30: [
      { label: "Inquiries", value: input.inquiries30 },
      { label: "New leads", value: leads30 },
      { label: "Deals opened", value: live.filter((d) => d.created_at >= iso30).length },
      { label: "Deals won", value: live.filter((d) => isWon(d) && (d.closed_at ?? "") >= iso30).length },
    ],
    conversion90: leads90 > 0 ? Math.round((1000 * won90) / leads90) / 10 : null,
    needsAttention,
  };
}

const first = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

export async function loadOverview(now = new Date()): Promise<OverviewMetrics> {
  const iso90 = new Date(now.getTime() - 90 * 86_400_000).toISOString();
  const iso30 = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const [dealsRes, stagesRes, invRes, ordRes, leadsRes, activeRes, inqRes] = await Promise.all([
    dealsForOverview(),
    selectPipelineStages("id, name, position, is_won, is_lost").order("position"),
    liveInvoices(5000),
    orderFigures(5000),
    selectLead("created_at").gte("created_at", iso90).limit(2000),
    selectLead("created_at, status, sla_due_at, people!person_id!inner(id, archived_at)").in("status", ACTIVE_LEAD_STATUSES).is("people.archived_at", null).limit(2000),
    // Inbound sales contact only: events, commerce and newsletter arrivals are not leads.
    selectInquiries("id", { count: "exact", head: true }).not("type", "in", NON_SALES_INQUIRY_TYPES).gte("created_at", iso30),
  ]);
  const errors = collectErrors(
    { error: dealsRes.error, label: "deals" },
    { error: stagesRes.error, label: "pipeline stages" },
    { error: invRes.error, label: "invoices" },
    { error: ordRes.error, label: "orders" },
    { error: leadsRes.error, label: "leads" },
    { error: activeRes.error, label: "lead queue" },
    { error: inqRes.error, label: "inquiries" },
  );
  const deals: OverviewDeal[] = ((dealsRes.data ?? []) as unknown as OverviewDealRow[]).map((r) => {
    const p = first(r.people);
    return { ...r, company_name: first(r.companies)?.name ?? null, person_name: personName(p, null) };
  });
  return aggregateOverview(
    {
      deals,
      stages: (stagesRes.data ?? []) as OverviewStage[],
      invoices: invRes.data ?? [],
      orders: ordRes.data ?? [],
      leads90: (leadsRes.data ?? []) as OverviewLead[],
      activeLeads: (activeRes.data ?? []) as unknown as OverviewLead[],
      inquiries30: inqRes.count ?? 0,
      errors,
    },
    now,
  );
}
