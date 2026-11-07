import { requirePermission } from "@/kernel/identity/access-request";
import { listClaimsToCheck } from "@/entities/reimbursements/lib/check-queue";
import { CheckQueue, CheckerWithoutPerson } from "@/entities/reimbursements/ui/CheckQueue";
import { ReimbursementTabs, readTabsFor } from "@/entities/reimbursements/ui/ReimbursementTabs";

export const metadata = {
  title: "Reimbursements to Check",
  description: "Submitted reimbursement claims waiting to be checked.",
};

// /admin/finance/reimbursements/to-check — the same queue as the Team view's
// To check, for a checker who works in Admin (the Employer, §4.9). Each claim
// opens on Admin's own claim page, so the checker stays in Admin; that page
// hands the checker's moves to whoever holds reimbursements.check. A viewer
// with no person record is refused as on every checker surface: the role that
// carries reimbursements.check is loaded only for someone with one.
export default async function AdminClaimsToCheckPage() {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("reimbursements.check");
  const tabs = await readTabsFor(access);
  return (
    <>
      <ReimbursementTabs active="to-check" {...tabs} sub="Submitted claims, oldest first. A claim waiting more than 3 days is marked. Your own claims are checked by someone else." />
      <section className="admin-card admin-section-card">
        {access.personId ? (
          <CheckQueue
            claims={await listClaimsToCheck(access.personId, { includeOwn: access.may("reimbursements.decide-own") })}
            hrefBase="/admin/finance/reimbursements"
          />
        ) : (
          <CheckerWithoutPerson />
        )}
      </section>
    </>
  );
}
