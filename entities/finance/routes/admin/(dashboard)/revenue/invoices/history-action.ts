"use server";

import { requirePermission } from "@/kernel/identity/access-request";
import { readAuditPage } from "@/kernel/audit/history-read";
import type { AuditPageResult } from "@/kernel/audit/history";

// The invoice's own audit trail, for the shelf's History tab (S.4). QuickBooks
// stays the source of truth for the invoice itself; this is the log of what the
// OS did to the row — the company link the shelf sets, and the sync's writes.
//
// Gated the way the rest of this shelf is: the ledger is revenue data, so the
// permission is company-os.commerce (admins and the Revenue role), not an admin-only one (map-action.ts).
export async function getInvoiceHistory(id: string, offset: number, limit: number): Promise<AuditPageResult> {
  await requirePermission("finance.invoices");
  return readAuditPage("invoices", id, offset, limit);
}
