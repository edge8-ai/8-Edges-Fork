import { companyOs } from "@/kernel/data/supabase";
import { liveInvoicesOfCompany } from "@/entities/finance";

// Reads for company_os.invoices (synced from QuickBooks) and the
// company -> QBO-customer mapping stored on companies.metadata.qbo_customer_ids.
// Admin surfaces only; /portal reads through entities/portal/lib/invoices.ts instead
// (which never selects `memo`).

export type AdminInvoice = {
  id: string;
  doc_number: string | null;
  txn_date: string;
  due_date: string | null;
  currency: string;
  amount_cents: number;
  balance_cents: number;
  status: string;
  memo: string | null;
  customer_name: string | null;
  deal_id: string | null;
};

export async function getInvoicesForCompany(companyId: string): Promise<AdminInvoice[]> {
  const { data, error: invoicesErr } = await liveInvoicesOfCompany(companyId);
  if (invoicesErr) console.error("[company-os/crm] invoices", invoicesErr);
  return data ?? [];
}
