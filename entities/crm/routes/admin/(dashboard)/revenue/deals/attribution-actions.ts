"use server";

import { revalidateSurfaces } from "@/kernel/shell/surface";
import { companyOs } from "@/kernel/data/supabase";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { selectInvoices, updateInvoices } from "@/entities/finance";
import type { Result } from "@/kernel/data/result";

// The two links the Revenue hub reads and nobody could write before (RH-2):
// which campaign a deal is attributed to, and which deal an invoice bills.
// Both are set by hand on the deal detail. The invoice write goes through the
// writer finance exports, because invoices are finance's table.

function refresh(dealId: string) {
  revalidateSurfaces("/revenue/deals");
  revalidateSurfaces(`/revenue/deals/${dealId}`);
  revalidateSurfaces("/revenue/demand");
  revalidateSurfaces("/revenue/billing");
}

export async function setDealCampaign(dealId: string, campaignId: string | null): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");
  const { error } = await companyOs.from("deals").update({ campaign_id: campaignId || null }).eq("id", dealId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "deals", recordId: dealId, operation: "update", actor: admin.email, newData: { campaign_id: campaignId || null } });
  refresh(dealId);
  return { ok: true };
}

// Link (or unlink, with null) an invoice to this deal. The invoice must bill
// the deal's company; a deal cannot claim another client's invoice.
export async function linkInvoiceToDeal(dealId: string, invoiceId: string, link: boolean): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");
  const [{ data: deal, error: dErr }, { data: invoice, error: iErr }] = await Promise.all([
    companyOs.from("deals").select("company_id").eq("id", dealId).maybeSingle(),
    selectInvoices("company_id, deal_id").eq("id", invoiceId).maybeSingle(),
  ]);
  if (dErr) return { ok: false, error: dErr.message };
  if (iErr) return { ok: false, error: iErr.message };
  if (!deal || !invoice) return { ok: false, error: "Deal or invoice not found." };
  const inv = invoice as { company_id: string | null; deal_id: string | null };
  if (link && deal.company_id && inv.company_id && deal.company_id !== inv.company_id) {
    return { ok: false, error: "That invoice bills a different company." };
  }
  if (link && inv.deal_id && inv.deal_id !== dealId) {
    return { ok: false, error: "That invoice is already linked to another deal." };
  }
  const { error } = await updateInvoices({ deal_id: link ? dealId : null }).eq("id", invoiceId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "invoices", recordId: invoiceId, operation: "update", actor: admin.email, newData: { deal_id: link ? dealId : null } });
  refresh(dealId);
  return { ok: true };
}
