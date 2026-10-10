"use server";

import { revalidateSurfaces } from "@/kernel/shell/surface";
import { requirePermission } from "@/kernel/identity/access-request";
import { syncQboInvoices, type QboEntity } from "@/entities/company-os";

// Admin-triggered "Sync now": pulls Edge8's QuickBooks company into the ledger.
// Same engine and the same company list as the weekly cron, which explains why
// AIO is left out. Returns a per-entity summary for the UI.
export type SyncSummary = {
  entity: QboEntity;
  ok: boolean;
  error?: string;
  fetched: number;
  upserted: number;
  unmappedCount: number;
};

export async function runInvoiceSync(): Promise<SyncSummary[]> {
  await requirePermission("finance.invoices");
  const entities: QboEntity[] = ["edge8"];
  const out: SyncSummary[] = [];
  for (const entity of entities) {
    const r = await syncQboInvoices(entity);
    out.push({
      entity: r.entity,
      ok: r.ok,
      error: r.error,
      fetched: r.fetched,
      upserted: r.upserted,
      unmappedCount: r.unmappedCount,
    });
  }
  revalidateSurfaces("/revenue/invoices");
  return out;
}
