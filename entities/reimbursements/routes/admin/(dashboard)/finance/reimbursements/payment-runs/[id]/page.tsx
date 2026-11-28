import { requirePermission } from "@/kernel/identity/access-request";
import { actorLabel } from "@/entities/reimbursements/lib/deciders";
import { PaymentRunPage } from "@/entities/reimbursements/ui/PaymentRunPage";

export const metadata = {
  title: "Payment Run",
  description: "One reimbursement payment run: who to pay, how much, and the bank details to pay into.",
};

// /admin/finance/reimbursements/payment-runs/[id] — the Team Finance run
// page's mirror in Admin (design §1.5, §1.11). Claims open on Admin's claim
// page for a viewer who may see every claim.
export default async function AdminPaymentRunPage(props: { params: Promise<{ id: string }> }) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("reimbursements.pay");
  const { id } = await props.params;
  return (
    <PaymentRunPage
      runId={id}
      actor={actorLabel(access)}
      claimHref={access.may("reimbursements.view") ? (claimId) => `/admin/finance/reimbursements/${claimId}` : undefined}
      spreadsheetHref={(runId) => `/admin/finance/reimbursements/payment-runs/${runId}/spreadsheet`}
    />
  );
}
