import Link from "next/link";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { PageHead } from "@/kernel/ui/PageHead";
import { listMyClaims } from "@/entities/reimbursements/lib/my-claims";
import { ClaimList } from "@/entities/reimbursements/ui/ClaimList";

export const metadata = {
  title: "My Claims",
  description: "Your reimbursement claims: start one, add receipts, submit it and follow it to payment.",
};

// /team/claims — My claims (plan section 8): the signed-in member's own claims
// only, each with its status line. Also reached from the profile's
// Reimbursements panel. Every read is filtered to the actor's own person id.
export default async function MyClaimsPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const claims = await listMyClaims(actor.personId);

  return (
    <>
      <PageHead
        title="My claims"
        sub="Your own claims only. Also on your profile, under Reimbursements."
        action={
          <Link className="admin-btn admin-btn--primary" href="/team/claims/new">
            Start a claim
          </Link>
        }
      />
      <section className="admin-card admin-section-card">
        <ClaimList claims={claims} />
      </section>
    </>
  );
}
