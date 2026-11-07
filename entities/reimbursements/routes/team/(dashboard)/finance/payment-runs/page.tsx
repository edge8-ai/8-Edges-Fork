import { requirePermission } from "@/kernel/identity/access-request";
import { actorLabel } from "@/entities/reimbursements/lib/deciders";
import { PaymentsPage } from "@/entities/reimbursements/ui/PaymentsPage";

export const metadata = {
  title: "Ready to pay",
  description: "The reimbursement payments waiting to be made, and the ones made.",
};

// /team/finance/payment-runs — Payments for the payer (Dave, 2026-10-12), in
// the Team Finance group, where the bookkeeper works without the Admin
// surface: every approved claim as a payment to make, Paid with its receipt.
export default async function PaymentRunsPage() {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("reimbursements.pay");
  return (
    <PaymentsPage
      actor={actorLabel(access)}
      hrefBase="/team/finance/payment-runs"
      claimHref={access.may("reimbursements.check") ? (claimId) => `/team/finance/claims/${claimId}` : undefined}
    />
  );
}
