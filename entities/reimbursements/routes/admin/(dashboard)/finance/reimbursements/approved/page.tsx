import { requirePermission } from "@/kernel/identity/access-request";
import { listClaimsForAdmin } from "@/entities/reimbursements/lib/check-queue";
import { CheckQueue } from "@/entities/reimbursements/ui/CheckQueue";
import { ReimbursementTabs, readTabsFor } from "@/entities/reimbursements/ui/ReimbursementTabs";

export const metadata = {
  title: "Approved Reimbursements",
  description: "Approved reimbursement claims waiting for, or in, a payment run.",
};

// /admin/finance/reimbursements/approved — the claims approved and not yet
// paid: waiting for the next run, or in one (design §1.5). Each shows the
// total frozen at approval, which is what the run pays.
export default async function AdminApprovedClaimsPage() {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("reimbursements.view");
  const tabs = await readTabsFor(access);
  return (
    <>
      <ReimbursementTabs active="approved" {...tabs} sub="Approved claims not yet paid, newest first: waiting for the next run, or in one." />
      <section className="admin-card admin-section-card">
        <CheckQueue claims={await listClaimsForAdmin("approved")} hrefBase="/admin/finance/reimbursements" empty="No approved claims are waiting to be paid." waitingLabel="Approved" />
      </section>
    </>
  );
}
