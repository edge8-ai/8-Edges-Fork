import { NAME_COLUMNS, type NamedPerson } from "@/kernel/config/people-name";
import { selectDeals } from "@/entities/crm/lib/reads";
import { columnList } from "./shared";

// The Revenue hub's deal reads, one named query per tab.
//
// Five tabs loaded `deals` and each carried the same chain by hand: a column
// list, `.limit(5000)`, and a cast to a row type declared somewhere else in the
// same file. `selectDeals` only names the table — the door file says so itself:
// "the helper only names the table and hands back the PostgREST builder, so the
// caller's columns, filters and ordering had to be carried over by hand." A
// caller that needs more than a table name wants a domain function
// (entities/org/lib/reads.ts:7-8), and this is that function, five times.
//
// The thing that actually drifts is the pairing. A column dropped from the
// string while its field stays on the row type is a field that is `undefined`
// at runtime and correct to the compiler, and `as BillingDeal[]` is what makes
// it look checked. So the column list is not a string here: it is an object
// keyed by the row type, and `columnList` will not compile if the two disagree
// in either direction.


// Every Revenue read is the whole book, capped rather than paged: the tabs
// aggregate over all of it and a page boundary would silently change a total.
// Named once so the five tabs cannot drift apart on the number.
const DEAL_CAP = 5000;

// ── Billing ──────────────────────────────────────────────────────────────
export type BillingDeal = {
  id: string;
  title: string | null;
  status: string | null;
  stage_id: string | null;
  amount_usd_cents: number | null;
  amount_cents: number | null;
  currency: string | null;
  probability: number | null;
  closed_at: string | null;
  expected_close_date: string | null;
  archived_at: string | null;
};

const BILLING_COLUMNS = columnList<BillingDeal>({
  id: "id", title: "title", status: "status", stage_id: "stage_id",
  amount_usd_cents: "amount_usd_cents", amount_cents: "amount_cents", currency: "currency",
  probability: "probability", closed_at: "closed_at", expected_close_date: "expected_close_date",
  archived_at: "archived_at",
});

/** Every deal the 90-day cash forecast weighs, open or not. */
export const dealsForBilling = () => selectDeals(BILLING_COLUMNS).limit(DEAL_CAP);

// ── Data health ──────────────────────────────────────────────────────────
export type FocusDeal = {
  id: string;
  stage_id: string | null;
  status: string | null;
  amount_cents: number | null;
  amount_usd_cents: number | null;
  currency: string | null;
  source: string | null;
  campaign_id: string | null;
  company_id: string | null;
  next_step: string | null;
  next_step_date: string | null;
  expected_close_date: string | null;
  updated_at: string | null;
  archived_at: string | null;
};

const HEALTH_COLUMNS = columnList<FocusDeal>({
  id: "id", stage_id: "stage_id", status: "status", amount_cents: "amount_cents",
  amount_usd_cents: "amount_usd_cents", currency: "currency", source: "source",
  campaign_id: "campaign_id", company_id: "company_id", next_step: "next_step",
  next_step_date: "next_step_date", expected_close_date: "expected_close_date",
  updated_at: "updated_at", archived_at: "archived_at",
});

/** Every deal the Data-health tab audits for missing fields. */
export const dealsForDataHealth = () => selectDeals(HEALTH_COLUMNS).limit(DEAL_CAP);

// ── Demand ───────────────────────────────────────────────────────────────
export type DemandDeal = {
  id: string;
  source: string | null;
  campaign_id: string | null;
  status: string | null;
  amount_usd_cents: number | null;
  amount_cents: number | null;
  // Optional as it was before this module existed. `-?` on the mapped type
  // means the column is still required in the list below, which is the point:
  // the query always asks for it, whatever the row type lets a fixture omit.
  currency?: string | null;
  archived_at: string | null;
};

const DEMAND_COLUMNS = columnList<DemandDeal>({
  id: "id", source: "source", campaign_id: "campaign_id", status: "status",
  amount_usd_cents: "amount_usd_cents", amount_cents: "amount_cents", currency: "currency",
  archived_at: "archived_at",
});

/** Every deal the channel and campaign attribution counts. */
export const dealsForDemand = () => selectDeals(DEMAND_COLUMNS).limit(DEAL_CAP);

// ── Pipeline ─────────────────────────────────────────────────────────────
export type PipelineDeal = {
  id: string;
  stage_id: string | null;
  status: string | null;
  amount_usd_cents: number | null;
  amount_cents: number | null;
  currency: string | null;
  probability: number | null;
  source: string | null;
  created_at: string;
  closed_at: string | null;
  expected_close_date: string | null;
  lost_reason: string | null;
  archived_at: string | null;
};

const PIPELINE_COLUMNS = columnList<PipelineDeal>({
  id: "id", stage_id: "stage_id", status: "status", amount_usd_cents: "amount_usd_cents",
  amount_cents: "amount_cents", currency: "currency", probability: "probability",
  source: "source", created_at: "created_at", closed_at: "closed_at",
  expected_close_date: "expected_close_date", lost_reason: "lost_reason",
  archived_at: "archived_at",
});

/** Every deal the stage bars, forecast and win rate read. */
export const dealsForPipeline = () => selectDeals(PIPELINE_COLUMNS).limit(DEAL_CAP);

// ── Overview ─────────────────────────────────────────────────────────────
// The one tab that embeds: it shows a company and a person beside each deal,
// so its query returns two nested rows the loader flattens onto OverviewDeal.
export type OverviewDeal = {
  id: string;
  title: string | null;
  stage_id: string | null;
  status: string | null;
  amount_cents: number | null;
  amount_usd_cents: number | null;
  currency: string | null;
  probability: number | null;
  owner_id: string | null;
  next_step: string | null;
  next_step_date: string | null;
  expected_close_date: string | null;
  created_at: string;
  closed_at: string | null;
  archived_at: string | null;
  company_name?: string | null;
  person_name?: string | null;
};

export type OverviewDealRow = Omit<OverviewDeal, "company_name" | "person_name"> & {
  companies: { name: string | null } | { name: string | null }[] | null;
  people: (NamedPerson & { email: string }) | (NamedPerson & { email: string })[] | null;
};

const OVERVIEW_COLUMNS = columnList<OverviewDealRow>({
  id: "id", title: "title", stage_id: "stage_id", status: "status",
  amount_cents: "amount_cents", amount_usd_cents: "amount_usd_cents", currency: "currency",
  probability: "probability", owner_id: "owner_id", next_step: "next_step",
  next_step_date: "next_step_date", expected_close_date: "expected_close_date",
  created_at: "created_at", closed_at: "closed_at", archived_at: "archived_at",
  companies: "companies!company_id(name)",
  people: `people!person_id(${NAME_COLUMNS})`,
});

/** Every deal the cockpit lists, with the company and person it belongs to. */
export const dealsForOverview = () => selectDeals(OVERVIEW_COLUMNS).limit(DEAL_CAP);

// Exported for deals.test.ts, which pins each query's chain against the one it
// replaced; nothing in the app reads the cap directly.
export { DEAL_CAP };
