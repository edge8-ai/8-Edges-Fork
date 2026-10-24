// Payments (Dave, 2026-10-12): the payments waiting to be processed, as the
// payer works them. He pays each person by bank transfer, then presses Paid and
// attaches the bank receipt. Shared by the Team Finance route and its Admin
// mirror; what differs by surface is handed in, as PaymentRunPage does.
//
// Opening the page first sweeps every approved claim into today's run, so
// what is approved is always here as a payment to make, with no run to build
// by hand. The sweep is the same idempotent build the cron runs on the 1st and
// the 15th, quiet: the cron's build sends the reminder, this one never does.
// Then every run still open is shown with its payments and the payer's
// controls, and the settled runs below as history.
import { PageHead } from "@/kernel/ui/PageHead";
import { saigonToday } from "@/kernel/config/dates";
import { buildPaymentRun } from "../lib/payment-runs";
import { readRunForPayer } from "../lib/payer-run";
import { listPaymentRuns } from "../lib/run-view";
import { confirmBankReceipt, openPaymentReceipt, recordPaid, returnToApproved, startBankReceipt } from "../lib/payer-actions";
import { PaymentRunList } from "./PaymentRunList";
import { PaymentRunView } from "./PaymentRunView";
import { payerControls } from "./PayerControls";

export async function PaymentsPage({
  actor,
  eyebrow,
  hrefBase,
  claimHref,
  spreadsheetHref,
}: {
  /** Who is reading, for the sweep's history rows and the bank read's audit row. */
  actor: string | null;
  eyebrow?: string;
  /** This surface's run pages: `${hrefBase}/${runId}`. */
  hrefBase: string;
  claimHref?: (claimId: string) => string;
  spreadsheetHref: (runId: string) => string;
}) {
  const swept = await buildPaymentRun(saigonToday(), { by: actor, quiet: true });
  const runs = await listPaymentRuns();
  const open = runs.filter((r) => r.status === "open");
  const settled = runs.filter((r) => r.status === "paid");
  const views = (await Promise.all(open.map((r) => readRunForPayer(r.id, actor, "run_page")))).filter((v) => v !== null);
  return (
    <>
      <PageHead eyebrow={eyebrow} title="Payments" sub="Everything approved is here to pay. Pay each person by bank transfer, then press Paid and attach the bank receipt." />
      {!swept.ok && (
        <div className="admin-alert admin-alert--err" role="alert">
          The approved claims could not be gathered into payments: {swept.error}
        </div>
      )}
      {views.length === 0 && <div className="admin-empty">Nothing is waiting to be paid.</div>}
      {views.map(({ run, banks }) => {
        const { controls, bulk } = payerControls(run, { startUpload: startBankReceipt, confirmUpload: confirmBankReceipt, record: recordPaid, giveBack: returnToApproved, openReceipt: openPaymentReceipt });
        return <PaymentRunView key={run.id} run={run} banks={banks} claimHref={claimHref} spreadsheetHref={spreadsheetHref(run.id)} controls={controls} bulk={bulk} />;
      })}
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
