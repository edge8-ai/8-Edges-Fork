import Link from "next/link";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { PageHead } from "@/kernel/ui/PageHead";
import { saigonToday } from "@/kernel/config/dates";
import { ADVANCES_OPEN } from "@/entities/reimbursements/lib/advance-policy";
import { readMyClosedAdvances, readMyOpenAdvance } from "@/entities/reimbursements/lib/my-advances";
import { listMyClaims } from "@/entities/reimbursements/lib/my-claims";
import { AdvanceCard } from "@/entities/reimbursements/ui/AdvanceCard";
import { ClaimList } from "@/entities/reimbursements/ui/ClaimList";
import { ClosedAdvances } from "@/entities/reimbursements/ui/ClosedAdvances";

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
  // No advance is read until they open, so this page's reads and its answer are
  // exactly what they were for everyone in the meantime.
  const [claims, advance, closedAdvances] = await Promise.all([
    listMyClaims(actor.personId),
    ADVANCES_OPEN ? readMyOpenAdvance(actor.personId) : null,
    ADVANCES_OPEN ? readMyClosedAdvances(actor.personId) : [],
  ]);

  return (
    <>
      <PageHead
        title="My claims"
        sub={ADVANCES_OPEN ? "Your own claims and advances, and where each one stands." : "Your own claims, and where each one stands."}
        action={
          <span className="u-row u-gap-1">
            {ADVANCES_OPEN && !advance && (
              <Link className="admin-btn" href="/team/claims/advances/new">
                Ask for an advance
              </Link>
            )}
            <Link className="admin-btn admin-btn--primary" href="/team/claims/new">
              Start a claim
            </Link>
          </span>
        }
      />
      {advance && <AdvanceCard advance={advance} today={saigonToday()} />}
      <section className="admin-card admin-section-card">
        <ClaimList claims={claims} />
      </section>
      <ClosedAdvances advances={closedAdvances} />
    </>
  );
}
