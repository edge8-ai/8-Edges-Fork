import { requirePermission } from "@/kernel/identity/access-request";
import { listClaimsForAdmin } from "@/entities/reimbursements/lib/check-queue";
import { CheckQueue } from "@/entities/reimbursements/ui/CheckQueue";
import { ReimbursementTabs, readTabsFor } from "@/entities/reimbursements/ui/ReimbursementTabs";

export const metadata = {
  title: "Reimbursements",
  description: "Every submitted reimbursement claim, newest first, with where it stands.",
};

// /admin/finance/reimbursements/all — every claim past draft, to help people
// (design §1.5, decision §4.2): who claimed what, where it stands and its
// total, with no bank details (§1.11). Each opens Admin's claim page.
export default async function AdminAllClaimsPage() {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("reimbursements.view");
  const tabs = await readTabsFor(access);
  return (
    <>
      <ReimbursementTabs active="all" {...tabs} sub="Every submitted claim, newest first. Drafts stay with their owners until they are sent." />
      <section className="admin-card admin-section-card">
        <CheckQueue claims={await listClaimsForAdmin("all")} hrefBase="/admin/finance/reimbursements" empty="No claims have been submitted yet." />
      </section>
    </>
  );
}
