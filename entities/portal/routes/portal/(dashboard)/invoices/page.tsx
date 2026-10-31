import { requirePortalPermission } from "@/kernel/identity/access-request";
import { getInvoicesForActor } from "@/entities/portal/lib/invoices";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { formatCents, formatDate, humanize } from "@/kernel/ui/format";

// Client-facing invoice ledger. Every field here comes from
// entities/portal/lib/invoices.ts's hard-restricted column list — `memo` is never
// selected, so there is nothing to accidentally leak in rendering.
export default async function PortalInvoicesPage() {
  const actor = await requirePortalPermission("surface.portal");
  const invoices = await getInvoicesForActor(actor);
  const openTotal = invoices.reduce((sum, inv) => sum + inv.balanceCents, 0);

  return (
    <>
      <PageHead
        eyebrow="Client Portal"
        title="Invoices"
        sub={openTotal > 0 ? `${formatCents(openTotal, "usd")} outstanding` : "You're all paid up."}
      />

      {invoices.length === 0 ? (
        <div className="admin-card admin-section-card">
          <div className="admin-empty">No invoices yet.</div>
        </div>
      ) : (
        invoices.map((inv) => (
          <div className="admin-card admin-section-card" key={inv.id}>
            <div className="u-row u-between u-wrap">
              <div>
                <h2 className="admin-card-title u-mb-1">
                  Invoice {inv.docNumber || inv.id.slice(0, 8)}
                </h2>
                <div className="admin-cell-muted">
                  {formatDate(inv.txnDate)}
                  {inv.dueDate ? ` · due ${formatDate(inv.dueDate)}` : ""}
                </div>
              </div>
              <div className="u-right">
                <div className="admin-cell-mono u-xl">
                  {formatCents(inv.amountCents, inv.currency)}
                </div>
                <Badge tone={statusTone(inv.status)}>{humanize(inv.status)}</Badge>
              </div>
            </div>

            {inv.balanceCents > 0 && (
              <p className="admin-page-sub u-mt-2">
                {formatCents(inv.balanceCents, inv.currency)} outstanding
                {inv.paymentLink && (
                  <>
                    {" · "}
                    <a href={inv.paymentLink} target="_blank" rel="noreferrer">
                      Pay now
                    </a>
                  </>
                )}
              </p>
            )}

            {inv.lines.length > 0 && (
              <details className="u-mt-3">
                <summary className="admin-cell-muted u-pointer">
                  Line items ({inv.lines.length})
                </summary>
                <div className="admin-table-wrap u-mt-2">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th className="u-right">Qty</th>
                        <th className="u-right">Rate</th>
                        <th className="u-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inv.lines.map((line, i) => (
                        <tr key={i}>
                          <td>{line.description || line.item_name || "—"}</td>
                          <td className="u-right">{line.quantity}</td>
                          <td className="admin-cell-mono u-right">
                            {formatCents(Math.round(line.rate * 100), inv.currency)}
                          </td>
                          <td className="admin-cell-mono u-right">
                            {formatCents(Math.round(line.amount * 100), inv.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        ))
      )}
    </>
  );
}
