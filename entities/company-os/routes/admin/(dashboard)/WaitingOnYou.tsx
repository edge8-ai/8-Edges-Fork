// "Waiting on you" on the admin home (S.5): every approval that names this
// admin, names a permission they hold (RB.3), or names nobody, read from the
// approvals primitive, oldest first. It lists and links; each flow's own
// screen is still where the decision is made, with its own rules. Nothing
// waiting renders nothing, so the card only takes room when there is something
// to do. A failed read costs this card, not the admin home, and says so: an
// empty card would read as "nothing needs you".
//
// It is never a side door (ADR 0013): an approval is listed only when the admin
// may open the screen it is decided on, by that screen's declared permission.
// Closed by default, so an approval with no screen here is not listed either.
import Link from "next/link";
import { waitingOn, type WaitingApproval } from "@/kernel/approvals/waiting";
import { APPROVAL_SUBJECTS } from "@/kernel/approvals/vocabulary";
import { decideHrefs } from "@/kernel/approvals/presentation";
import { getAccess } from "@/kernel/identity/access-request";
import { mayOpen } from "@/kernel/identity/may-open";
import { personIdForEmail } from "@/kernel/identity/person-by-email";
import { timeAgo } from "@/kernel/ui/format";

type Listed = { approval: WaitingApproval; href: string };

async function load(email: string): Promise<Listed[] | null> {
  try {
    const [personId, access] = await Promise.all([personIdForEmail(email), getAccess()]);
    // The permissions come from the access this render already resolved, so an
    // approval addressed to a role reaches the admins who hold it, and only them.
    const waiting = await waitingOn(personId, { admin: true, permissions: access?.permissions() ?? [] });
    return waiting.flatMap((approval) => {
      // Where each kind is decided, Admin's pages first (kernel/approvals/presentation):
      // a claim's checker whom Admin's claim page does not reach goes to the Team
      // view's checker page, an approver to the To approve list
      // (app/__tests__/waiting-on-you.test.tsx).
      const href = decideHrefs(approval, "admin").find((h) => mayOpen(access, h));
      return href ? [{ approval, href }] : [];
    });
  } catch (err) {
    console.error("[company-os] waiting on you", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function WaitingOnYou({ email }: { email: string }) {
  const items = await load(email);
  if (items === null) {
    return (
      <section className="admin-card admin-section-card u-mt-5">
        <div className="admin-card-head">
          <h2 className="admin-card-title">Waiting on you</h2>
        </div>
        <p className="admin-alert admin-alert--err">Couldn&rsquo;t load what is waiting on you just now.</p>
      </section>
    );
  }
  if (items.length === 0) return null;
  return (
    <section className="admin-card admin-section-card u-mt-5">
      <div className="admin-card-head">
        <h2 className="admin-card-title">Waiting on you</h2>
      </div>
      <div className="admin-list">
        {items.map(({ approval: a, href }) => (
          <Link key={a.id} href={href} className="admin-list-row">
            <span className="admin-list-main">
              <span className="admin-list-title">{a.label}</span>
              <span className="admin-list-sub">{`${APPROVAL_SUBJECTS[a.subjectType]} · asked ${timeAgo(a.createdAt)}`}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
