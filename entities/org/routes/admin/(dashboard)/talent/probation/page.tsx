import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { getProbationRows } from "@/entities/org/lib/probation";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { saigonToday } from "@/kernel/config/dates";

export const metadata = {
  title: "Probation",
  description: "Team members on probation and when their review is due.",
};

// Review window: managers get nudged when a probation is 2 weeks (or less) out.
const REVIEW_WINDOW_DAYS = 14;

export default async function ProbationPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("org.people");
  const rows = await getProbationRows(saigonToday());
  const dueSoon = rows.filter((r) => r.daysLeft !== null && r.daysLeft <= REVIEW_WINDOW_DAYS).length;

  return (
    <>
      <PageHead
        eyebrow={<Link href="/admin/talent/team">← Team</Link>}
        title="Probation"
        sub={`${rows.length} on probation${dueSoon ? ` · ${dueSoon} review${dueSoon === 1 ? "" : "s"} due soon` : ""}`}
      />

      {rows.length === 0 ? (
        <div className="admin-empty">Nobody is on probation right now.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Position</th>
                <th>Manager</th>
                <th>Started</th>
                <th>Probation ends</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const overdue = r.daysLeft !== null && r.daysLeft < 0;
                const dueSoon = r.daysLeft !== null && r.daysLeft >= 0 && r.daysLeft <= REVIEW_WINDOW_DAYS;
                return (
                  <tr key={r.teamMemberId}>
                    <td className="admin-cell-strong">
                      <Link href={`/admin/talent/team/${r.teamMemberId}`}>{r.name}</Link>
                    </td>
                    <td>{r.position || <span className="admin-cell-muted">—</span>}</td>
                    <td>{r.managerName || <span className="admin-cell-muted">—</span>}</td>
                    <td>{r.startDate ? formatDate(r.startDate) : "—"}</td>
                    <td>{r.endsOn ? formatDate(r.endsOn) : <span className="admin-cell-muted">—</span>}</td>
                    <td>
                      <Link href={`/admin/talent/reviews?subject=${r.teamMemberId}`}>
                        {r.daysLeft === null ? (
                          <span className="admin-cell-muted">no date</span>
                        ) : overdue ? (
                          <Badge tone="err">Overdue {Math.abs(r.daysLeft)}d</Badge>
                        ) : dueSoon ? (
                          <Badge tone="warn">Due in {r.daysLeft}d</Badge>
                        ) : (
                          <span className="admin-cell-muted">in {r.daysLeft}d</span>
                        )}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
