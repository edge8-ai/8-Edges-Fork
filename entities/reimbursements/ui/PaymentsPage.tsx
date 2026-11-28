// Payments (Dave, 2026-10-12): the payments waiting to be processed, as the
// payer works them. He pays each person by bank transfer, then presses Paid,
// attaching the bank receipt when he has one. Shared by the Team Finance route
// and its Admin mirror; what differs by surface is handed in, as
// PaymentRunPage does.
//
// Opening the page first sweeps every approved claim into today's run, so
// what is approved is always here as a payment to make, with no run to build
// by hand. The sweep is the same idempotent build the cron runs on the 1st and
// the 15th, quiet: the cron's build sends the reminder, this one never does.
// Runs are bookkeeping the payer never needs to see (Dave, 2026-10-28): every
// payment still to pay, from whichever run holds it, is one Ready to pay list.
// The settled runs sit below as history.
import { PageHead } from "@/kernel/ui/PageHead";
import { saigonToday } from "@/kernel/config/dates";
import { buildPaymentRun } from "../lib/payment-runs";
import { readRunForPayer } from "../lib/payer-run";
import { listPaymentRuns, type RunDetail } from "../lib/run-view";
import type { PayeeBank } from "../lib/bank-details";
import { confirmBankReceipt, openPaymentReceipt, recordPaid, returnToApproved, startBankReceipt } from "../lib/payer-actions";
import { PaymentRunList } from "./PaymentRunList";
import { PaymentRunView } from "./PaymentRunView";
import { payerControls } from "./PayerControls";

/**
 * Every payment still to pay as one list with the payer's controls, after the
 * sweep. Also rendered on Admin's Ready to pay tab for a viewer who pays.
 */
export async function ReadyToPay({ actor, claimHref }: { actor: string | null; claimHref?: (claimId: string) => string }) {
  const swept = await buildPaymentRun(saigonToday(), { by: actor, quiet: true });
  const open = (await listPaymentRuns()).filter((r) => r.status === "open");
  const views = (await Promise.all(open.map((r) => readRunForPayer(r.id, actor, "run_page")))).filter((v) => v !== null);
  const payments = views.flatMap((v) => v.run.payments).filter((p) => p.state === "to_pay");
  const banks = new Map<string, PayeeBank>(views.flatMap((v) => [...v.banks]));
  const all: RunDetail = {
    id: "ready-to-pay",
    runDate: saigonToday(),
    status: "open",
    claims: payments.reduce((n, p) => n + p.claims.length, 0),
    people: payments.length,
    totalVnd: payments.reduce((n, p) => n + p.amountVnd, 0),
    builtAt: new Date().toISOString(),
    paidAt: null,
    payments,
  };
  const { controls, bulk } = payerControls(all, { startUpload: startBankReceipt, confirmUpload: confirmBankReceipt, record: recordPaid, giveBack: returnToApproved, openReceipt: openPaymentReceipt });
  return (
    <>
      {!swept.ok && (
        <div className="admin-alert admin-alert--err" role="alert">
          The approved claims could not be gathered into payments: {swept.error}
        </div>
      )}
      {payments.length === 0 ? (
        <div className="admin-empty">Nothing is waiting to be paid.</div>
      ) : (
        <PaymentRunView run={all} banks={banks} claimHref={claimHref} controls={controls} bulk={bulk} />
      )}
    </>
  );
}

export async function PaymentsPage({
  actor,
  eyebrow,
  hrefBase,
  claimHref,
}: {
  /** Who is reading, for the sweep's history rows and the bank read's audit row. */
  actor: string | null;
  eyebrow?: string;
  /** This surface's run pages: `${hrefBase}/${runId}`. */
  hrefBase: string;
  claimHref?: (claimId: string) => string;
}) {
  const settled = (await listPaymentRuns()).filter((r) => r.status === "paid");
  return (
    <>
      <PageHead eyebrow={eyebrow} title="Ready to pay" sub="Everything approved is here. Pay each person by bank transfer, then press Paid. Attach the bank receipt if you have it." />
      <ReadyToPay actor={actor} claimHref={claimHref} />
      {settled.length > 0 && (
        <section className="admin-card admin-section-card">
          <div className="admin-card-head">
            <h2 className="admin-card-title">Paid</h2>
          </div>
          <PaymentRunList runs={settled} hrefBase={hrefBase} />
        </section>
      )}
    </>
  );
}
