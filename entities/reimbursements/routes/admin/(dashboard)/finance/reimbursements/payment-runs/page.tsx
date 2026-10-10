import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { saigonToday } from "@/kernel/config/dates";
import { listPaymentRuns } from "@/entities/reimbursements/lib/run-view";
import { latestRunDate } from "@/entities/reimbursements/lib/run-rules";
import { PaymentRunList } from "@/entities/reimbursements/ui/PaymentRunList";
import { BuildRun } from "@/entities/reimbursements/ui/BuildRun";
import { buildRunFor } from "@/entities/reimbursements/lib/payer-actions";

export const metadata = {
  title: "Payment Runs",
  description: "The reimbursement payment runs built on the 1st and the 15th, each with who to pay and how much.",
};

// /admin/finance/reimbursements/payment-runs — the Team Finance page's mirror
// in Admin (design §1.5), so a payer who works in Admin stays there. Same
// permission, same list, same actions.
export default async function AdminPaymentRunsPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("reimbursements.pay");
  const runs = await listPaymentRuns();
  return (
    <>
      <PageHead eyebrow="Reimbursements" title="Payment runs" sub="Built at 08:00 Vietnam time on the 1st and the 15th from the claims approved before that day. Pay each person in the bank, then record it." />
      <section className="admin-card admin-section-card">
        <PaymentRunList runs={runs} hrefBase="/admin/finance/reimbursements/payment-runs" />
      </section>
      <section className="admin-card admin-section-card">
        <BuildRun build={buildRunFor} defaultDate={latestRunDate(saigonToday())} hrefBase="/admin/finance/reimbursements/payment-runs" />
      </section>
    </>
  );
}
