import { requirePermission } from "@/kernel/identity/access-request";
import { listClaimsForAdmin } from "@/entities/reimbursements/lib/check-queue";
import { CheckQueue } from "@/entities/reimbursements/ui/CheckQueue";
import { ReimbursementTabs, readTabsFor } from "@/entities/reimbursements/ui/ReimbursementTabs";

export const metadata = {
  title: "Paid Reimbursements",
  description: "Reimbursement claims that have been paid back.",
};

// /admin/finance/reimbursements/paid — the claims paid back (design §1.5),
// newest first, each with the total it was approved at.
export default async function AdminPaidClaimsPage() {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("reimbursements.view");
  const tabs = await readTabsFor(access);
  return (
    <>
      <ReimbursementTabs active="paid" {...tabs} sub="Claims paid back, newest first." />
      <section className="admin-card admin-section-card">
        <CheckQueue claims={await listClaimsForAdmin("paid")} hrefBase="/admin/finance/reimbursements" empty="No claims have been paid yet." waitingLabel="Approved" />
      </section>
    </>
  );
}
