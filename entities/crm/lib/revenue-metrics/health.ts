import { companyOs } from "@/kernel/data/supabase";
import { selectPipelineStages } from "@/entities/crm/lib/reads";
import { dealsForDataHealth, type FocusDeal } from "./deals";
import { INVOICE_VOIDED, selectInvoices } from "@/entities/finance";
import { cents, collectErrors, dealState, sourceChannel, usdOf, type Loaded, type StageFlags } from "./shared";
import type { PipelineMetrics } from "./pipeline";
import type { DemandMetrics } from "./demand";
import type { BillingMetrics } from "./billing";
import type { MarketMetrics } from "./market";
import type { ClientMetrics } from "./clients";

// Data health (RH-4, widened 2026-09-13): every gap the other tabs work
// around, as a count with the exact rows to fix. The counts used to link to
// the whole deal list; now each one names a focus the deals page understands
// (`?focus=no-amount`), so a count of four opens those four.

export const DEAL_FOCUS = {
  "no-amount": "Open deals without an amount",
  "no-close-date": "Open deals without an expected close date",
  "no-source": "Live deals without a source",
  "legacy-import": "Live deals sourced 'legacy import'",
  "no-campaign": "Live deals without a campaign",
  "no-company": "Live deals without a company",
  "no-next-step": "Open deals without a next step or its date",
  "stale-90": "Open deals untouched for 90 days",
  "foreign-no-usd": "Open deals in another currency with no USD figure",
  "won-unbilled": "Won deals without a linked invoice",
  "no-stage-log": "Live deals with no stage history",
} as const;
export type DealFocus = keyof typeof DEAL_FOCUS;
export const isDealFocus = (v: string | undefined): v is DealFocus => !!v && v in DEAL_FOCUS;

export type FocusSets = Loaded & Record<DealFocus, string[]>;

// Pure: which live deals fall into each focus. Tested without a database.
export function computeFocusSets(deals: FocusDeal[], stages: StageFlags[], linkedDealIds: Set<string>, loggedDealIds: Set<string>, now: Date, errors: string[] = []): FocusSets {
  const live = deals.filter((d) => !d.archived_at);
  // This tab exists to catch tabs disagreeing with each other, which it cannot
  // do while computing "won" independently of Pipeline and Billing. Same seam,
  // same answer.
  const { isWon, isClosed } = dealState(stages);
  const open = live.filter((d) => !isClosed(d));
  const staleBefore = new Date(now.getTime() - 90 * 86_400_000).toISOString();
  const ids = (ds: FocusDeal[]) => ds.map((d) => d.id);
  return {
    errors,
    "no-amount": ids(open.filter((d) => usdOf(d) <= 0 && !(cents(d.amount_cents) > 0))),
    "no-close-date": ids(open.filter((d) => !d.expected_close_date)),
    "no-source": ids(live.filter((d) => !d.source)),
    "legacy-import": ids(live.filter((d) => sourceChannel(d.source) === "legacy import")),
    "no-campaign": ids(live.filter((d) => !d.campaign_id)),
    "no-company": ids(live.filter((d) => !d.company_id)),
    "no-next-step": ids(open.filter((d) => !d.next_step || !d.next_step_date)),
    "stale-90": ids(open.filter((d) => (d.updated_at ?? "") < staleBefore)),
    "foreign-no-usd": ids(open.filter((d) => cents(d.amount_cents) > 0 && usdOf(d) <= 0)),
    "won-unbilled": ids(live.filter((d) => isWon(d) && !linkedDealIds.has(d.id))),
    "no-stage-log": ids(live.filter((d) => !loggedDealIds.has(d.id))),
  };
}

export async function loadFocusSets(now = new Date()): Promise<FocusSets> {
  const [dealsRes, stagesRes, invRes, logRes] = await Promise.all([
    dealsForDataHealth(),
    selectPipelineStages("id, is_won, is_lost"),
    selectInvoices("deal_id").not("deal_id", "is", null).neq("status", INVOICE_VOIDED).limit(5000),
    companyOs.from("deal_stage_current").select("deal_id"),
  ]);
  const errors = collectErrors(
    { error: dealsRes.error, label: "deals" },
    { error: stagesRes.error, label: "pipeline stages" },
    { error: invRes.error, label: "invoice links" },
    { error: logRes.error, label: "stage log" },
  );
  return computeFocusSets(
    (dealsRes.data ?? []) as FocusDeal[],
    (stagesRes.data ?? []) as StageFlags[],
    new Set(((invRes.data ?? []) as { deal_id: string | null }[]).map((i) => i.deal_id as string)),
    new Set(((logRes.data ?? []) as { deal_id: string | null }[]).map((l) => l.deal_id as string)),
    now,
    errors,
  );
}

// What the deals page shows when opened with ?focus=: the label, and the ids
// to keep. Null for no focus or an unknown one, so a stale link degrades to
// the whole list rather than an empty board.
export async function resolveDealFocus(focus: string | undefined): Promise<{ key: DealFocus; label: string; ids: string[] } | null> {
  if (!isDealFocus(focus)) return null;
  const sets = await loadFocusSets();
  return { key: focus, label: DEAL_FOCUS[focus], ids: sets[focus] };
}

export type HealthCheck = { key: string; label: string; count: number; why: string; href: string; cta: string; tone?: "warn" | "info" };

const deals = (focus: DealFocus) => `/admin/revenue/deals?focus=${focus}`;

// The checklist, assembled from the four tabs' loaders and the focus sets.
// Order: what breaks the forecast first, then attribution, then billing, then
// hygiene. A zero stays on the page in green so the list reads as a checklist.
export function buildHealthChecks(p: PipelineMetrics, d: DemandMetrics, b: BillingMetrics, m: MarketMetrics, f: FocusSets, c: ClientMetrics): HealthCheck[] {
  // Delivery cost that names no client is the gap that decides whether gross
  // margin can be computed at all (RF-3). It is listed first among the billing
  // rows because until it is zero the margin card reports "unknown" rather
  // than a number, which is a bigger hole than any single unlinked invoice.
  const costChecks: HealthCheck[] = [
        {
          key: "cost-untagged",
          label: "Expenses with no client",
          count: c.costGaps.untaggedExpenses,
          why: `Delivery cost that nothing claims, so it sits in the "unmapped" row and no client's margin carries it. Every expense today is a QuickBooks P&L category summary rather than a transaction, which is the wrong grain to attribute; the client column fills once per-transaction expenses sync. A general overhead correctly stays untagged.`,
          href: "/admin/revenue/billing/clients",
          cta: "See the effect",
          tone: c.costKnown ? "info" : undefined,
        },
        {
          key: "cost-unassigned",
          label: "Contractor payments with no client assignment",
          count: c.costGaps.unassignedPayments,
          why: "The person was paid for a month in which they were assigned to no client, so their cost cannot reach one. Record the staff assignment covering that period on their team profile.",
          href: "/admin/operations/contractor-payments",
          cta: "Open payments",
          tone: c.costKnown ? "info" : undefined,
        },
        {
          key: "cost-foreign",
          label: "Cost rows in another currency",
          count: c.costGaps.foreignCurrencyRows,
          why: "An expense or contractor payment not in USD has no dollar figure on the row, so it counts as nothing rather than as a wrong number. It needs an FX conversion before it can join a margin.",
          href: "/admin/operations/contractor-payments",
          cta: "Open payments",
          tone: "info",
        },
  ];
  return [
    { key: "no-amount", label: DEAL_FOCUS["no-amount"], count: f["no-amount"].length, why: "Missing from the open-pipeline total and the forecast. Proposal and later refuse the move until it is filled.", href: deals("no-amount"), cta: "Open the deals" },
    { key: "no-close-date", label: DEAL_FOCUS["no-close-date"], count: f["no-close-date"].length, why: "Missing from the expected-close forecast. Same rule at Proposal.", href: deals("no-close-date"), cta: "Open the deals" },
    { key: "foreign-no-usd", label: DEAL_FOCUS["foreign-no-usd"], count: f["foreign-no-usd"].length, why: "The deal has an amount, but no FX row turned it into dollars, so every USD total counts it as nothing. Save the deal once to refresh the rate.", href: deals("foreign-no-usd"), cta: "Open the deals" },
    { key: "no-next-step", label: DEAL_FOCUS["no-next-step"], count: f["no-next-step"].length, why: "A deal with no next step or no date for it is not being worked; the Overview lists these as needing attention.", href: deals("no-next-step"), cta: "Open the deals" },
    { key: "stale-90", label: DEAL_FOCUS["stale-90"], count: f["stale-90"].length, why: "Nothing on the deal has changed in a quarter. Close it, lose it, or move it.", href: deals("stale-90"), cta: "Open the deals" },
    { key: "no-company", label: DEAL_FOCUS["no-company"], count: f["no-company"].length, why: "A deal without a company cannot be matched to invoices or a client hub. Set the account on the deal.", href: deals("no-company"), cta: "Open the deals" },
    { key: "no-source", label: DEAL_FOCUS["no-source"], count: f["no-source"].length, why: "Counted as 'no source' on the Demand tab. A source is one edit on the deal.", href: deals("no-source"), cta: "Open the deals" },
    { key: "legacy-import", label: DEAL_FOCUS["legacy-import"], count: f["legacy-import"].length, why: "The old CRM's name, not a channel. Replace with how the client was found.", href: deals("legacy-import"), cta: "Open the deals" },
    { key: "no-campaign", label: DEAL_FOCUS["no-campaign"], count: f["no-campaign"].length, why: "Campaign attribution counts only linked deals. Set it on the deal detail; leave it empty when no campaign applies.", href: deals("no-campaign"), cta: "Open the deals", tone: "info" },
    { key: "inq-unlinked", label: "Inquiries not linked to a deal", count: d.inquiries - d.linkedToDeal, why: "Inquiry-to-deal conversion is unmeasurable for these. New hand-offs link automatically; history needs a hand.", href: "/admin/revenue/inquiries", cta: "Open inquiries", tone: "info" },
    { key: "won-unbilled", label: DEAL_FOCUS["won-unbilled"], count: f["won-unbilled"].length, why: "The won-versus-billed table shows no bar for these. Link the invoices from the deal detail's Billing section.", href: deals("won-unbilled"), cta: "Open the deals" },
    { key: "inv-unlinked", label: "Invoices not linked to a deal", count: b.unlinkedInvoices, why: "Recurring and legacy invoices may never need one; a project invoice should name its deal.", href: "/admin/revenue/invoices?deal=none", cta: "Open invoices", tone: "info" },
    { key: "inv-unclassified", label: "Invoices with no kind", count: b.unclassified, why: "Neither recurring nor project could be read off the line items, so the recurring-book split leaves these out. The next QuickBooks sync retries; a line item name fixes it for good.", href: "/admin/revenue/invoices?kind=none", cta: "Open invoices" },
    { key: "ar-overdue", label: "Invoices past due", count: b.overdue.length, why: "Receivable that is late. The Billing tab ages it; each row here is a call to make.", href: "/admin/revenue/invoices?status=overdue", cta: "Open invoices" },
    ...costChecks,
    { key: "no-stage-log", label: DEAL_FOCUS["no-stage-log"], count: f["no-stage-log"].length, why: "The deal was created by a path that skipped the log, so its stage history is empty and its age in stage falls back to its creation. Every path now logs; these are the ones from before.", href: deals("no-stage-log"), cta: "Open the deals", tone: "info" },
    { key: "co-dupes", label: "Companies that look like duplicates", count: m.duplicates.reduce((a, g) => a + g.ids.length, 0), why: "Same name once case, punctuation and Ltd/Inc/Pty are dropped. Two records for one client split its deals and invoices.", href: "/admin/revenue/companies", cta: "Open companies" },
    { key: "co-none", label: "Companies with no lifecycle stage", count: m.byLifecycle.find((x) => x.label === "none")?.value ?? 0, why: "Nobody has placed these; the Market tab's lifecycle chart calls them 'none'.", href: "/admin/revenue/companies", cta: "Open companies", tone: "info" },
    { key: "archived", label: "Archived deals", count: p.archived, why: "Out of every figure on these tabs. Worth one pass to decide what in the archive is history and what is import noise.", href: "/admin/revenue/deals", cta: "Open the deals", tone: "info" },
  ];
}
