import { Badge, statusTone } from "@/kernel/ui/Badge";
import { formatCents, formatDate, humanize } from "@/kernel/ui/format";
import type { HubInvoice } from "../lib/hub-invoice";

// Client Hub invoices tab. Read-only list; the `memo` field is never carried in
// HubInvoice, so this is safe on client-facing surfaces. Shared across the team
// hub, the admin 360 hub, and the portal.
export function InvoicesPanel({ invoices }: { invoices: HubInvoice[] }) {
  if (invoices.length === 0) {
    return <div className="admin-empty">No invoices yet.</div>;
  }
  return (
    <div className="admin-list">
      {invoices.map((inv) => (
        <div className="admin-list-row" key={inv.id}>
          <div className="admin-list-main">
            <div className="admin-list-title">{inv.docNumber ? `#${inv.docNumber}` : "Invoice"}</div>
            <div className="admin-list-sub">{formatDate(inv.txnDate)}</div>
          </div>
          <div className="admin-list-aside admin-list-aside--row">
            <span className="admin-cell-mono">{formatCents(inv.amountCents, inv.currency)}</span>
            <Badge tone={statusTone(inv.status)}>{humanize(inv.status) || "Open"}</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
