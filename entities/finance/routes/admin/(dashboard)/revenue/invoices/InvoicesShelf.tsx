"use client";

import Link from "next/link";
import { createContext, useContext, useState, type MouseEvent, type ReactNode } from "react";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { formatCents, formatDate, humanize } from "@/kernel/ui/format";
import { RecordHistory } from "@/kernel/ui/RecordHistory";
import { type InvoiceListRow, primaryContact, qboInvoiceUrl } from "./invoice-shared";
import { CustomerCompanyField } from "./CustomerCompanyField";
import { getInvoiceHistory } from "./history-action";
import type { MayProp } from "@/kernel/identity/may-prop";
import { personName } from "@/kernel/config/people-name";

// Client-owned shelf for the invoices ledger. One drawer lives at the provider
// level; rows only push the selected invoice into context (never through
// DataTable's server-rendered getRowPreview — interactive content there
// renders with dead clicks). Read-only: QuickBooks is the source of truth.

const ShelfContext = createContext<{ open: (row: InvoiceListRow) => void } | null>(null);

// `may` decides the controls that call an action: the history and the
// customer link (finance.invoices).
export function InvoicesShelfProvider({ children, may }: { children: ReactNode; may: MayProp }) {
  const [selected, setSelected] = useState<InvoiceListRow | null>(null);

  return (
    <ShelfContext.Provider value={{ open: setSelected }}>
      {children}
      <DetailDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        eyebrow="Invoice"
        title={selected?.doc_number ? `#${selected.doc_number}` : "Invoice"}
        action={
          selected && (
            <a href={qboInvoiceUrl(selected.external_id, selected.entity)} target="_blank" rel="noreferrer" className="admin-btn">
              Open in QuickBooks ↗
            </a>
          )
        }
        history={
          selected && may["finance.invoices"] && (
            <RecordHistory key={selected.id} load={(offset, limit) => getInvoiceHistory(selected.id, offset, limit)} />
          )
        }
      >
        {selected && <InvoiceShelfBody row={selected} may={may} />}
      </DetailDrawer>
    </ShelfContext.Provider>
  );
}

export function InvoiceShelfRow({ row, children }: { row: InvoiceListRow; children: ReactNode }) {
  const ctx = useContext(ShelfContext);

  // The row itself carries role="button", so exclude it from the interactive-
  // element guard — closest() matches the element AND its ancestors, and a
  // guard that can match the row swallows every click (dead shelf).
  function hitsInnerInteractive(e: { target: EventTarget; currentTarget: HTMLTableRowElement }) {
    const hit = (e.target as HTMLElement).closest("a,button,input,select,label,[role=button]");
    return !!hit && hit !== e.currentTarget;
  }

  function onClick(e: MouseEvent<HTMLTableRowElement>) {
    if (hitsInnerInteractive(e)) return;
    ctx?.open(row);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>) {
    if (e.key === "Enter" || e.key === " ") {
      if (hitsInnerInteractive(e)) return;
      e.preventDefault();
      ctx?.open(row);
    }
  }

  return (
    <tr className="is-clickable" onClick={onClick} onKeyDown={onKeyDown} tabIndex={0} role="button" aria-haspopup="dialog">
      {children}
    </tr>
  );
}

function kv(label: string, value: ReactNode) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function InvoiceShelfBody({ row, may }: { row: InvoiceListRow; may: MayProp }) {
  const contact = primaryContact(row);

  return (
    <div className="admin-shelf-sections">
      <section>
        <div className="admin-shelf-heading">Details</div>
        <dl className="admin-kv">
          {kv("Status", <Badge tone={statusTone(row.status)}>{humanize(row.status)}</Badge>)}
          {kv("Amount", <span className="admin-cell-mono">{formatCents(row.amount_cents, row.currency)}</span>)}
          {row.balance_cents > 0 &&
            kv("Balance due", <span className="admin-cell-mono">{formatCents(row.balance_cents, row.currency)}</span>)}
          {kv("Invoice date", formatDate(row.txn_date))}
          {kv("Due date", row.due_date ? formatDate(row.due_date) : null)}
          {kv(
            "Primary contact",
            contact ? <Link href={`/admin/contacts/${contact.id}`}>{personName(contact, "(no name)")}</Link> : null,
          )}
          {kv("Billed to", row.customer_name !== row.companies?.name ? row.customer_name : null)}
          {kv("Memo", row.memo)}
        </dl>
        <CustomerCompanyField row={row} may={may} />
      </section>

      {row.lines.length > 0 && (
        <section>
          <div className="admin-shelf-heading">Line items</div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Rate</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {row.lines.map((l, i) => (
                  <tr key={i}>
                    <td>
                      {l.item_name}
                      {l.description && <div className="admin-cell-muted">{l.description}</div>}
                    </td>
                    <td className="admin-cell-mono">{l.quantity}</td>
                    <td className="admin-cell-mono">{formatCents(Math.round(l.rate * 100), row.currency)}</td>
                    <td className="admin-cell-mono">{formatCents(Math.round(l.amount * 100), row.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
