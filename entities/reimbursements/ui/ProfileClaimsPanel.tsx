// The plan's "Profile → Reimbursements": the member's latest claims on their
// profile, with the way to start one and to see them all. Team's profile page
// renders it through the ProfileClaimsPanel slot (kernel/shell/page-slots.ts),
// so team never names this entity.
//
// It shows only to someone who holds reimbursements.mine, the permission the
// claims pages declare, so the panel never links to a page that would refuse.
import Link from "next/link";
import { getAccess } from "@/kernel/identity/access-request";
import { listMyClaims } from "../lib/my-claims";
import { ClaimList } from "./ClaimList";

const SHOWN = 3;

export async function ProfileClaimsPanel({ personId }: { personId: string }) {
  const access = await getAccess();
  if (!access?.may("reimbursements.mine")) return null;
  const claims = await listMyClaims(personId, SHOWN);
  return (
    <section className="admin-card admin-section-card">
      <div className="admin-card-head">
        <h2 className="admin-card-title">Reimbursements</h2>
        <Link className="admin-btn admin-btn--sm" href="/team/claims/new">
          Start a claim
        </Link>
      </div>
      <ClaimList claims={claims} />
      {claims.length > 0 && (
        <p className="admin-page-sub">
          <Link href="/team/claims">All my claims</Link>
        </p>
      )}
    </section>
  );
}
