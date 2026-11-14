import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { listClientCycles } from "@/entities/org/lib/client-reviews/overview";

export const metadata = {
  title: "Client reviews",
  description: "Every client review cycle: who is in it, and where each review stands.",
};

// /admin/talent/reviews/clients: every client review cycle, newest first
// (CR.2.3). Any holder of the reviews permission sees every cycle, whoever
// opened it, so a colleague can pick one up (story 16).
export default async function ClientReviewsPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("org.reviews");
  const cycles = await listClientCycles();
  return (
    <div className="ats">
      <PageHead
        eyebrow={<Link href="/admin/talent/reviews">Talent · Reviews</Link>}
        title="Client reviews"
        sub={`${cycles.length} ${cycles.length === 1 ? "cycle" : "cycles"}. A client rates the people placed with them, through links you copy and send yourself.`}
        // The page's own permission is the one opening needs, so the link shows to everyone who sees the page.
        action={
          <Link className="admin-btn admin-btn--primary" href="/admin/talent/reviews/clients/new">
            Open a cycle
          </Link>
        }
      />
      {cycles.length === 0 ? (
        <div className="admin-empty">No client review cycles yet.</div>
      ) : (
        <div className="admin-card u-p-4">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Cycle</th>
                  <th>Client</th>
                  <th>Framework</th>
                  <th>Opened</th>
                  <th>Members</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {cycles.map((c) => (
                  <tr key={c.id}>
                    <td className="admin-cell-strong">
                      <Link href={`/admin/talent/reviews/clients/${c.id}`}>{c.name}</Link>
                    </td>
                    <td>{c.clientName ?? <span className="admin-cell-muted">—</span>}</td>
                    <td>{c.frameworkName ?? <span className="admin-cell-muted">—</span>}</td>
                    <td>{formatDate(c.openedAt)}</td>
                    <td>{c.members}</td>
                    <td>{c.closedAt ? <Badge tone="neutral">Closed {formatDate(c.closedAt)}</Badge> : <Badge tone="info">Open</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
