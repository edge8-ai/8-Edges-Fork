// One payment run as a page (plan section 8, design §1.11), shared by the Team
// Finance route and its Admin mirror: the bank details of the people still to
// pay are read through the audited read on every open, for this run's people
// only, and the payer's controls call the shared actions in lib/. What
// differs by surface is handed in: where a claim opens and where the run's
// spreadsheet downloads. The route keeps its own guard (reimbursements.pay,
// the page's declared permission, ADR 0013) and passes who is reading.
import { notFound } from "next/navigation";
import { PageHead } from "@/kernel/ui/PageHead";
import { formatDate } from "@/kernel/ui/format";
import { isUuid } from "@/kernel/config/slug";
import { readRunForPayer } from "../lib/payer-run";
import { confirmBankReceipt, openPaymentReceipt, recordPaid, returnToApproved, startBankReceipt } from "../lib/payer-actions";
import { PaymentRunView } from "./PaymentRunView";
import { payerControls } from "./PayerControls";

export async function PaymentRunPage({
  runId,
  actor,
  claimHref,
  spreadsheetHref,
}: {
  runId: string;
  /** Who is reading, for the bank read's audit row. */
  actor: string | null;
  /** Where one claim opens on this surface; absent for a viewer whose access reaches no claim page. */
  claimHref?: (claimId: string) => string;
  spreadsheetHref: (runId: string) => string;
}) {
  if (!isUuid(runId)) notFound();
  const read = await readRunForPayer(runId, actor, "run_page");
  if (!read) notFound();
  const { run, banks } = read;
  const { controls, bulk } = payerControls(run, { startUpload: startBankReceipt, confirmUpload: confirmBankReceipt, record: recordPaid, giveBack: returnToApproved, openReceipt: openPaymentReceipt });
  return (
    <>
      <PageHead
        eyebrow="Payment runs"
        title={`Payment run · ${formatDate(run.runDate)}`}
        sub="Pay each person in the bank, one transfer per person, then record each payment with its bank receipt."
      />
      <PaymentRunView run={run} banks={banks} claimHref={claimHref} spreadsheetHref={spreadsheetHref(run.id)} controls={controls} bulk={bulk} />
    </>
  );
}
