import { requirePermission } from "@/kernel/identity/access-request";
import { actorLabel } from "@/entities/reimbursements/lib/deciders";
import { PaymentsPage } from "@/entities/reimbursements/ui/PaymentsPage";

export const metadata = {
  title: "Ready to pay",
  description: "The reimbursement payments waiting to be made, and the ones made.",
};

// /admin/finance/reimbursements/payment-runs — the Team Finance Payments
// page's mirror in Admin (design §1.5), so a payer who works in Admin stays
// there. Same permission, same payments, same actions.
export default async function AdminPaymentRunsPage() {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("reimbursements.pay");
  return (
    <PaymentsPage
      actor={actorLabel(access)}
      eyebrow="Reimbursements"
      hrefBase="/admin/finance/reimbursements/payment-runs"
      claimHref={access.may("reimbursements.view") ? (claimId) => `/admin/finance/reimbursements/${claimId}` : undefined}
    />
  );
}
