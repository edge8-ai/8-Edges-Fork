import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { listClaimsToCheck } from "@/entities/reimbursements/lib/check-queue";
import { CheckQueue, CheckerWithoutPerson } from "@/entities/reimbursements/ui/CheckQueue";

export const metadata = {
  title: "To Check",
  description: "Submitted reimbursement claims waiting to be checked.",
};

// /team/finance/claims/to-check — the checker's queue (plan section 8): every
// submitted claim but the viewer's own (the Employer's own included, §1.6),
// oldest first. Finance checks here from the Team view; a contractor in
// Finance holds no Admin surface.
export default async function ClaimsToCheckPage() {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("reimbursements.check");
  return (
    <>
      <PageHead eyebrow="Finance" title="To check" sub="Submitted claims, oldest first. Your own claims are checked by someone else." />
      <section className="admin-card admin-section-card">
        {access.personId ? (
          <CheckQueue
            claims={await listClaimsToCheck(access.personId, { includeOwn: access.may("reimbursements.decide-own") })}
            hrefBase="/team/finance/claims"
          />
        ) : (
          <CheckerWithoutPerson />
        )}
      </section>
    </>
  );
}
