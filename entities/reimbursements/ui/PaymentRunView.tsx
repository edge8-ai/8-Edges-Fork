// One payment run as the payer sees it (plan section 8, design §1.11): who to
// pay, for which claims and since when, how much, where each payment stands,
// and the bank details to pay into, for the people in this run only. The
// Team Finance page and its Admin mirror render the same view; what differs
// is where links lead and the payer's controls, handed in by the page (RB.7),
// because nothing under ui/ may import a route.
import type { ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate, formatVndWhole } from "@/kernel/ui/format";
import type { PayeeBank } from "../lib/bank-details";
import { progressOf, type PaymentState, type RunDetail, type RunPayment } from "../lib/run-view";

const STATE: Record<PaymentState, { tone: "ok" | "warn" | "err"; label: string }> = {
  to_pay: { tone: "warn", label: "To pay" },
  paid: { tone: "ok", label: "Paid" },
  returned: { tone: "err", label: "Returned to approved" },
};

export type PaymentRunViewProps = {
  run: RunDetail;
  banks: Map<string, PayeeBank>;
  /** Where one claim opens on this surface; no link for a viewer whose access does not reach a claim page. */
  claimHref?: (claimId: string) => string;
  /** The run's spreadsheet, built on request behind the page's own permission. */
  spreadsheetHref: string;
  /** The payer's controls for one payment, whatever its state (RB.7): record or return it, or open its receipt. */
  controls?: (payment: RunPayment) => ReactNode;
  /** Shown above the list: the payer's "Mark selected paid" (RB.7). */
  bulk?: ReactNode;
};

function BankCell({ bank, payment }: { bank: PayeeBank | undefined; payment: RunPayment }) {
  if (payment.state === "paid") {
    return (
      <span className="admin-list-sub">
        Paid to {payment.bankNameSnapshot ?? "the bank on file"}
        {payment.accountLast4 ? ` ····${payment.accountLast4}` : ""}
      </span>
    );
  }
  if (!bank) return <Badge tone="err">No bank details on file</Badge>;
  return (
    <span className="u-stack">
      <span>
        {bank.bankName || "Bank not named"}
        {bank.branch ? ` · ${bank.branch}` : ""}
      </span>
      <span className="admin-cell-mono">{bank.accountNumber || "No account number"}</span>
      <span className="admin-list-sub">Account holder: {payment.personName}</span>
    </span>
  );
}

export function PaymentRunView({ run, banks, claimHref, spreadsheetHref, controls, bulk }: PaymentRunViewProps) {
  const { settled, toPay } = progressOf(run.payments);
  const people = run.payments.length;
  return (
    <div className="u-stack u-gap-4">
      {run.status === "paid" && (
        <div className="admin-alert admin-alert--ok" role="status">
          <strong>The whole run is paid.</strong> accounting@ was sent one summary email.
        </div>
      )}
      <div className="admin-alert admin-alert--info" role="note">
        <strong>Bank details are shown here for the {people} {people === 1 ? "person" : "people"} in this run only.</strong> Opening this page was recorded in the audit
        log. The spreadsheet is built when you ask for it, behind sign-in, and is never emailed.
      </div>
      <section className="admin-card admin-section-card">
        <div className="u-row u-between u-items-center u-wrap u-gap-1">
          <div>
            <div className="admin-hint">
              {people} {people === 1 ? "person" : "people"} · {run.claims} {run.claims === 1 ? "claim" : "claims"}
            </div>
            <div className="admin-cell-mono u-lg u-strong">{formatVndWhole(run.totalVnd)}</div>
          </div>
          <div className="admin-hint">
            {settled} of {people} settled · {toPay} to pay
          </div>
          <a className="admin-btn" href={spreadsheetHref}>
            Download the spreadsheet
          </a>
        </div>
      </section>
      {bulk}
      <section className="admin-card admin-section-card">
        {run.payments.length === 0 ? (
          <div className="admin-empty">This run has nobody to pay.</div>
        ) : (
          <div className="admin-list">
            {run.payments.map((p) => (
              <div key={p.id} className="admin-list-row">
                <div className="admin-list-main">
                  <div className="admin-list-title">{p.personName}</div>
                  <div className="admin-list-sub">
                    {p.claims.length === 0
                      ? "No claims left in this run."
                      : p.claims.map((c, i) => (
                          <span key={c.id}>
                            {i > 0 ? " · " : ""}
                            {claimHref ? <Link href={claimHref(c.id)}>{c.title}</Link> : c.title} (requested {formatDate(c.submittedAt)})
                          </span>
                        ))}
                  </div>
                  {p.state === "paid" && (
                    <div className="admin-list-sub">
                      Paid {formatVndWhole(p.paidVnd)} on {formatDate(p.paidAt)}
                      {p.paidVnd !== null && p.paidVnd !== p.amountVnd ? `, ${formatVndWhole(Math.abs(p.paidVnd - p.amountVnd))} different from the claims' total` : ""}.
                    </div>
                  )}
                  {p.state === "returned" && <div className="admin-list-sub">Returned: {p.returnReason ?? "the transfer failed"}. The claims wait for the next run.</div>}
                  <BankCell bank={banks.get(p.personId)} payment={p} />
                  {controls?.(p)}
                </div>
                <div className="admin-list-aside">
                  <span className="admin-cell-mono u-strong">{formatVndWhole(p.amountVnd)}</span>
                  <Badge tone={STATE[p.state].tone}>{STATE[p.state].label}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
