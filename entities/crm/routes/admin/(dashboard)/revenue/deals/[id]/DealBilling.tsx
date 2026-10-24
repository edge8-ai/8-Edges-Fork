"use client";

import { useState, useTransition } from "react";
import { formatCents, formatDate } from "@/kernel/ui/format";
import { linkInvoiceToDeal } from "../attribution-actions";

export type BillingInvoice = {
  id: string;
  doc_number: string | null;
  txn_date: string;
  currency: string;
  amount_cents: number;
  balance_cents: number;
  status: string;
  deal_id: string | null;
};

// The invoices that bill this deal's company, with a link per row (RH-2). The
// linked total sits against the deal amount so "was the won amount billed" is
// read off the page instead of checked by hand in QuickBooks. An invoice
// linked to another deal is shown, not offered.
export function DealBilling({
  dealId,
  dealAmountCents,
  dealCurrency,
  invoices,
}: {
  dealId: string;
  dealAmountCents: number | null;
  dealCurrency: string | null;
  invoices: BillingInvoice[];
}) {
  const [rows, setRows] = useState(invoices);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const linked = rows.filter((i) => i.deal_id === dealId);
  const linkedCents = linked.reduce((a, i) => a + i.amount_cents, 0);
  const currency = dealCurrency ?? linked[0]?.currency ?? "usd";

  function toggle(invoice: BillingInvoice, link: boolean) {
    start(async () => {
      const r = await linkInvoiceToDeal(dealId, invoice.id, link);
      if (!r.ok) {
        setNote(r.error);
        return;
      }
      setNote(null);
      setRows((rs) => rs.map((i) => (i.id === invoice.id ? { ...i, deal_id: link ? dealId : null } : i)));
    });
  }

  return (
    <div className="admin-card admin-section-card">
      <div className="admin-kpi-label u-mb-2">Billing</div>
      <div className="admin-kpi-val">
        {formatCents(linkedCents, currency)}
        <span className="admin-kpi-note"> billed on {linked.length} linked {linked.length === 1 ? "invoice" : "invoices"}</span>
      </div>
      <div className="admin-kpi-note u-mb-3">
        {dealAmountCents != null && dealAmountCents > 0
          ? `Deal amount ${formatCents(dealAmountCents, currency)} · ${Math.round((100 * linkedCents) / dealAmountCents)}% billed`
          : "No deal amount to compare against."}
      </div>
      {note && <div className="admin-alert admin-alert--err u-mb-2">{note}</div>}
      {rows.length === 0 ? (
        <div className="admin-empty">No invoices for this company yet.</div>
      ) : (
        <div className="admin-list">
          {rows.map((i) => {
            const mine = i.deal_id === dealId;
            const other = !!i.deal_id && !mine;
            return (
              <div key={i.id} className="admin-list-row">
                <div className="admin-list-main">
                  <div className="admin-list-title">
                    {i.doc_number ?? "Invoice"} · {formatCents(i.amount_cents, i.currency)}
                  </div>
                  <div className="admin-list-sub">
                    {formatDate(i.txn_date)} · {i.status}
                    {i.balance_cents > 0 ? ` · ${formatCents(i.balance_cents, i.currency)} open` : ""}
                    {other ? " · linked to another deal" : ""}
                  </div>
                </div>
                <div className="admin-list-aside">
                  {other ? null : (
                    <button type="button" className={`admin-btn admin-btn--sm${mine ? "" : " admin-btn--ghost"}`} disabled={pending} onClick={() => toggle(i, !mine)}>
                      {mine ? "Unlink" : "Link to this deal"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
