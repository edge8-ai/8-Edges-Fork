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
import { anyInvoiceOf, clientInvoices } from "@/entities/finance";
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

// Billing is admin-only: both the entitlement and the read scope come from the
// companies where the actor holds the admin role, not the full companyScope.
export async function hasInvoices(actor: PortalActor): Promise<boolean> {
  const scope = adminCompanyScope(actor);
  if (scope.length === 0) return false;
  const { data, error: invoicesError } = await anyInvoiceOf(scope);
  if (invoicesError) console.error("[portal] invoices read failed:", invoicesError.message);
  return (data ?? []).length > 0;
}

export async function getInvoicesForActor(actor: PortalActor): Promise<PortalInvoice[]> {
  const scope = adminCompanyScope(actor);
  if (scope.length === 0) return [];

  // Finance's question selects exactly the columns below, and never `memo`.
  const { data, error: invoicesError2 } = await clientInvoices(scope);
  if (invoicesError2) console.error("[portal] invoices read failed:", invoicesError2.message);

  return (data ?? []).map((r) => ({
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
