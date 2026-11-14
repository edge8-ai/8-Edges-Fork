"use server";

import { revalidateSurfaces } from "@/kernel/shell/surface";
import { requirePermission } from "@/kernel/identity/access-request";
import { syncQboPnl, type PnlSyncResult } from "@/entities/company-os";

// "Sync now" on the P&L page: the monthly routine's engine, run on demand after
// a late correction in QuickBooks. Edge8 only, as the routine is.
export async function runPnlSync(): Promise<PnlSyncResult> {
  await requirePermission("finance.pnl");
  const result = await syncQboPnl("edge8");
  revalidateSurfaces("/finance/pnl");
  return result;
}
