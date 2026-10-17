// Client-visible invoices. A dedicated, reviewed helper — same reasoning as
// entities/portal/lib/team.ts and entities/portal/lib/time-off.ts, and the highest-stakes one:
// this table holds every client's revenue, so scope and column list both
// matter.
//
// PRIVACY HARD LINE (docs/plans/2026-07-11-client-portal-design.md): `memo`
// (QuickBooks' private memo field) is never selected here, not just hidden in
// the UI. Line items ARE shown — they're the client's own bill, already on
// the PDF they receive. `payment_link` is always null today (there is no
// live QuickBooks payment-link source wired up yet); the portal page simply
// omits the Pay button whenever it's null, so this needs no special-casing
// here.

import { companyOs } from "@/kernel/data/supabase";
import { INVOICE_VOIDED, selectInvoices } from "@/entities/finance";
import type { PortalActor } from "@/kernel/identity/portal-auth";
import { adminCompanyScope } from "@/entities/portal/lib/roles";

export type PortalInvoice = {
  id: string;
  docNumber: string | null;
  txnDate: string;
  dueDate: string | null;
  currency: string;
  amountCents: number;
  balanceCents: number;
  status: string;
  paymentLink: string | null;
  lines: { description: string; quantity: number; rate: number; amount: number; item_name: string | null }[];
};

type Row = {
  id: string;
  doc_number: string | null;
  txn_date: string;
  due_date: string | null;
  currency: string;
  amount_cents: number;
  balance_cents: number;
  status: string;
  payment_link: string | null;
  lines: unknown;
};

// Billing is admin-only: both the entitlement and the read scope come from the
// companies where the actor holds the admin role, not the full companyScope.
export async function hasInvoices(actor: PortalActor): Promise<boolean> {
  const scope = adminCompanyScope(actor);
  if (scope.length === 0) return false;
  const { data, error: invoicesError } = await selectInvoices("id")
    .in("company_id", scope)
    .limit(1);
  if (invoicesError) console.error("[portal] invoices read failed:", invoicesError.message);
  return (data ?? []).length > 0;
}

export async function getInvoicesForActor(actor: PortalActor): Promise<PortalInvoice[]> {
  const scope = adminCompanyScope(actor);
  if (scope.length === 0) return [];

  const { data, error: invoicesError2 } = await selectInvoices("id, doc_number, txn_date, due_date, currency, amount_cents, balance_cents, status, payment_link, lines")
    .in("company_id", scope)
    .neq("status", INVOICE_VOIDED)
    .order("txn_date", { ascending: false });
  if (invoicesError2) console.error("[portal] invoices read failed:", invoicesError2.message);

  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    docNumber: r.doc_number,
    txnDate: r.txn_date,
    dueDate: r.due_date,
    currency: r.currency,
    amountCents: r.amount_cents,
    balanceCents: r.balance_cents,
    status: r.status,
    paymentLink: r.payment_link,
    lines: (r.lines ?? []) as PortalInvoice["lines"],
  }));
}
