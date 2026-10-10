import { requirePermission } from "@/kernel/identity/access-request";
import { listClaimsToApprove } from "@/entities/reimbursements/lib/check-queue";
import { CheckQueue, CheckerWithoutPerson } from "@/entities/reimbursements/ui/CheckQueue";
import { ReimbursementTabs, readTabsFor } from "@/entities/reimbursements/ui/ReimbursementTabs";

export const metadata = {
  title: "Reimbursements to Approve",
  description: "Checked reimbursement claims waiting for approval.",
};

// /admin/finance/reimbursements/to-approve — the approver's queue (plan
// section 8, design §1.5): every checked claim, oldest check first, each with
// the total an approval would freeze. The viewer's own claims are left out
// unless they may decide their own (the Employer, §1.6), since nobody else
// can approve those. Each opens Admin's claim page, where the approver
// decides. A viewer with no person record is refused, reading nothing:
// without one their own claims cannot be left out.
export default async function AdminClaimsToApprovePage() {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("reimbursements.approve");
  const tabs = await readTabsFor(access);
  return (
    <>
      <ReimbursementTabs active="to-approve" {...tabs} sub="Checked claims, oldest first. Approving fixes the total the next payment run pays." />
      <section className="admin-card admin-section-card">
        {access.personId ? (
          <CheckQueue
            claims={await listClaimsToApprove(access.personId, { includeOwn: access.may("reimbursements.decide-own") })}
            hrefBase="/admin/finance/reimbursements"
            empty="Nothing is waiting for approval."
          />
        ) : (
          <CheckerWithoutPerson />
        )}
      </section>
    </>
  );
}
