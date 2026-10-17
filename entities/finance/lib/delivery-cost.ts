import { companyOs } from "@/kernel/data/supabase";
import { selectStaffAssignments } from "@/entities/contacts";

// What it cost to serve a client, by month (RF-3, 2026-09-14).
//
// Neither cost table names a client. `expenses` carries a `vendor_id` and now
// an attribution column of ours, `company_id`; `contractor_payments` carries a
// `person_id` and a `period_month`. So the cost of serving a client is derived
// two ways and what neither way can claim is reported rather than dropped:
//
//   expenses     → the client named on the row, by `incurred_on`'s month;
//   contractors  → the clients that person was assigned to that month, split
//                  evenly between them, through `staff_assignments`;
//   unmapped     → cost that IS delivery cost but reaches no client: a
//                  contractor payment for a month with no assignment. Kept as
//                  its own figure so a margin built on this can never read
//                  better than the data supports.
//   untagged     → spend that nothing has classified: an expense with no
//                  client. This is deliberately NOT unmapped delivery cost and
//                  never enters a margin. Today every expense row is a
//                  QuickBooks P&L category summary, so the book holds
//                  "Taxes paid" and "Legal fees" beside "AI Program
//                  Contractor"; calling that sum unmapped DELIVERY cost would
//                  overstate what is unknown and make every margin look worse
//                  than the evidence supports. It is reported on its own, and
//                  Data health counts the rows.
//
// The person id is a join key inside this file and nothing more. No type this
// module exports has a person on it, and none may gain one: the figures here
// describe clients, kinds of work and months. That is the CEO rule, and it is
// enforced here by the shape of the return type rather than by a convention.

export type CostMonths = readonly string[];

// What a client was billed in the window, split by kind, so cost can be split
// the same way. The caller owns this because the kind lives on the invoice and
// the caller is already reading invoices; handing it in keeps one arithmetic.
export type BilledMix = { companyId: string; recurringCents: number; projectCents: number };

export type ClientCost = { companyId: string; cents: number };
export type KindCost = { recurring: number; project: number; unknown: number };

export type DeliveryCost = {
  /** Attributed cost per client, in cents, highest first. */
  byClient: ClientCost[];
  /** The same total split by the kind of work the client was billed under. */
  byKind: KindCost;
  /** Delivery cost that reaches no client: contractor pay with no assignment. */
  unmappedCents: number;
  /** Spend nothing has classified as delivery cost or overhead. Never a margin. */
  untaggedSpendCents: number;
  /** How much cost was attributed at all — `byClient` summed. */
  mappedCents: number;
  /** What Data health reports: the rows a human has to touch to fix this. */
  gaps: { untaggedExpenses: number; unassignedPayments: number; foreignCurrencyRows: number };
  errors: string[];
};

export type ExpenseCostRow = { id: string; amount_cents: number | null; currency: string | null; incurred_on: string | null; company_id: string | null };
export type ContractorCostRow = { id: string; amount_cents: number | null; currency: string | null; period_month: string | null; person_id: string | null };
export type AssignmentRow = { team_member_id: string; company_id: string | null; start_date: string | null; end_date: string | null; status: string | null };
export type TeamMemberRow = { id: string; person_id: string };

const monthOf = (iso: string | null | undefined): string | null => (iso ? String(iso).slice(0, 7) : null);
const isUsd = (c: string | null | undefined): boolean => (c ?? "usd").toLowerCase() === "usd";
const amountOf = (r: { amount_cents: number | null }): number => (typeof r.amount_cents === "number" && Number.isFinite(r.amount_cents) ? r.amount_cents : 0);

// The first and last day of a month key, so an assignment's date range can be
// tested against the month a payment is for.
const monthStart = (month: string): string => `${month}-01`;
function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

// An assignment covers a month when its range overlaps that month at all. An
// open assignment (no end date) covers every month from its start; one that
// never started is not evidence of anything and covers nothing.
export function assignmentCoversMonth(a: AssignmentRow, month: string): boolean {
  if (!a.company_id) return false;
  if (a.status === "cancelled") return false;
  if (!a.start_date || a.start_date > monthEnd(month)) return false;
  return !a.end_date || a.end_date >= monthStart(month);
}

export function aggregateDeliveryCost(
  expenses: ExpenseCostRow[],
  payments: ContractorCostRow[],
  assignments: AssignmentRow[],
  teamMembers: TeamMemberRow[],
  months: CostMonths,
  billed: BilledMix[],
  errors: string[] = [],
): DeliveryCost {
  const inWindow = new Set(months);
  const perClient = new Map<string, number>();
  const add = (companyId: string, cents: number) => perClient.set(companyId, (perClient.get(companyId) ?? 0) + cents);
  let unmapped = 0;
  let untaggedSpend = 0;
  let untaggedExpenses = 0;
  let unassignedPayments = 0;
  let foreignCurrencyRows = 0;

  for (const e of expenses) {
    const month = monthOf(e.incurred_on);
    if (!month || !inWindow.has(month)) continue;
    const cents = amountOf(e);
    if (cents <= 0) continue;
    // A cost in another currency has no USD figure on the row and nothing here
    // invents one; it is counted as a gap rather than added as wrong dollars.
    if (!isUsd(e.currency)) {
      foreignCurrencyRows++;
      continue;
    }
    if (e.company_id) add(e.company_id, cents);
    else {
      // Unclassified spend, not unmapped delivery cost: nothing on a P&L
      // category row says whether it was incurred serving a client.
      untaggedSpend += cents;
      untaggedExpenses++;
    }
  }

  // A contractor payment names a person and a month. Who that person served
  // that month is what `staff_assignments` records, so the payment is split
  // evenly between the clients they were assigned to. Evenly is a choice, and
  // a visible one: with no hours per client anywhere, any other weighting
  // would be a more confident guess wearing the same clothes.
  const personByTeamMember = new Map(teamMembers.map((t) => [t.id, t.person_id]));
  const byPerson = new Map<string, AssignmentRow[]>();
  for (const a of assignments) {
    const personId = personByTeamMember.get(a.team_member_id);
    if (!personId) continue;
    byPerson.set(personId, [...(byPerson.get(personId) ?? []), a]);
  }
  for (const p of payments) {
    const month = monthOf(p.period_month);
    if (!month || !inWindow.has(month) || !p.person_id) continue;
    const cents = amountOf(p);
    if (cents <= 0) continue;
    if (!isUsd(p.currency)) {
      foreignCurrencyRows++;
      continue;
    }
    const claims = (byPerson.get(p.person_id) ?? []).filter((a) => assignmentCoversMonth(a, month));
    if (claims.length === 0) {
      unmapped += cents;
      unassignedPayments++;
      continue;
    }
    // Integer cents, with the remainder on the first client, so a split never
    // loses or invents a cent against the total.
    const each = Math.floor(cents / claims.length);
    claims.forEach((a, i) => add(a.company_id as string, i === 0 ? cents - each * (claims.length - 1) : each));
  }

  // Cost follows the mix of what that client was billed in the same window. A
  // client with cost but nothing billed has no mix to follow and its cost is
  // "unknown", never silently halved between the two kinds.
  const mixOf = new Map(billed.map((b) => [b.companyId, b]));
  const byKind: KindCost = { recurring: 0, project: 0, unknown: 0 };
  for (const [companyId, cents] of perClient) {
    const mix = mixOf.get(companyId);
    const total = (mix?.recurringCents ?? 0) + (mix?.projectCents ?? 0);
    if (!mix || total <= 0) {
      byKind.unknown += cents;
      continue;
    }
    const recurring = Math.round((cents * mix.recurringCents) / total);
    byKind.recurring += recurring;
    byKind.project += cents - recurring;
  }

  const byClient = [...perClient.entries()]
    .map(([companyId, cents]) => ({ companyId, cents }))
    .sort((a, b) => b.cents - a.cents || a.companyId.localeCompare(b.companyId));

  return {
    byClient,
    byKind,
    unmappedCents: unmapped,
    untaggedSpendCents: untaggedSpend,
    mappedCents: byClient.reduce((a, c) => a + c.cents, 0),
    gaps: { untaggedExpenses, unassignedPayments, foreignCurrencyRows },
    errors,
  };
}

/**
 * The delivery cost of the given months, by client and by kind. The one door
 * another entity uses; the Revenue hub's margin card and clients table both
 * read this and nothing else, so the two can never disagree.
 */
export async function loadDeliveryCost(months: CostMonths, billed: BilledMix[]): Promise<DeliveryCost> {
  if (months.length === 0) return aggregateDeliveryCost([], [], [], [], months, billed);
  const sorted = [...months].sort();
  months = sorted;
  // Finance owns `expenses` and `contractor_payments`, so it reads them
  // directly; `staff_assignments` belongs to contacts and comes through its
  // door; `team_members` is a kernel table, readable by every entity.
  //
  // The cost reads are bounded by the window, not just by a row cap. The cap
  // alone is an asymmetric risk: a truncated invoice read understates revenue,
  // which is conservative, but a truncated COST read understates cost, which
  // flatters every margin on the page. The per-transaction expense sync this
  // column was added for is exactly what pushes these tables past the cap.
  const first = `${months[0]}-01`;
  const lastMonth = months[months.length - 1];
  const [ly, lm] = lastMonth.split("-").map(Number);
  const last = new Date(Date.UTC(ly, lm, 0)).toISOString().slice(0, 10);
  const [expRes, payRes, assignRes, tmRes] = await Promise.all([
    companyOs.from("expenses").select("id, amount_cents, currency, incurred_on, company_id").gte("incurred_on", first).lte("incurred_on", last).limit(20000),
    companyOs.from("contractor_payments").select("id, amount_cents, currency, period_month, person_id").gte("period_month", first).lte("period_month", last).limit(20000),
    selectStaffAssignments("team_member_id, company_id, start_date, end_date, status").limit(20000),
    companyOs.from("team_members").select("id, person_id").limit(20000),
  ]);
  const errors: string[] = [];
  if (expRes.error) errors.push(`expenses: ${expRes.error.message}`);
  if (payRes.error) errors.push(`contractor payments: ${payRes.error.message}`);
  if (assignRes.error) errors.push(`staff assignments: ${assignRes.error.message}`);
  if (tmRes.error) errors.push(`team members: ${tmRes.error.message}`);
  return aggregateDeliveryCost(
    (expRes.data ?? []) as unknown as ExpenseCostRow[],
    (payRes.data ?? []) as unknown as ContractorCostRow[],
    (assignRes.data ?? []) as unknown as AssignmentRow[],
    (tmRes.data ?? []) as TeamMemberRow[],
    months,
    billed,
    errors,
  );
}
