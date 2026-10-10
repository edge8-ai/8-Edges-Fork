import { requirePermission } from "@/kernel/identity/access-request";
import { actorLabel } from "@/entities/reimbursements/lib/deciders";
import { PaymentRunPage } from "@/entities/reimbursements/ui/PaymentRunPage";

export const metadata = {
  title: "Payment Run",
  description: "One reimbursement payment run: who to pay, how much, and the bank details to pay into.",
};

// /team/finance/payment-runs/[id] — one run for the payer (plan section 8,
// design §1.11). Claims open on the checker's claim page for a payer who also
// checks; the page itself is shared with the Admin mirror.
export default async function TeamPaymentRunPage(props: { params: Promise<{ id: string }> }) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("reimbursements.pay");
  const { id } = await props.params;
  return (
    <PaymentRunPage
      runId={id}
      actor={actorLabel(access)}
      claimHref={access.may("reimbursements.check") ? (claimId) => `/team/finance/claims/${claimId}` : undefined}
      spreadsheetHref={(runId) => `/team/finance/payment-runs/${runId}/spreadsheet`}
    />
  );
}
