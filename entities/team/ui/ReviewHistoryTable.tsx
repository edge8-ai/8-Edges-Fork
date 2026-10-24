"use client";

import { useRouter } from "next/navigation";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { formatDate, humanize } from "@/kernel/ui/format";
import { REVIEW_TYPE_LABEL, DECISION_LABEL, type MemberReviewCycle } from "@/entities/team/lib/reviews-labels";

// Performance-review history, shared by the admin team page and the coaching
// Performance tab. Each row opens the full cycle at /team/reviews/[id];
// getReviewDetail authorizes the viewer there (subject, reviewer, the subject's
// coach, or a sensitive-cleared admin), so an unauthorized click lands on the
// review page's own not-found rather than leaking anything here.
export function ReviewHistoryTable({ cycles }: { cycles: MemberReviewCycle[] }) {
  const router = useRouter();
  if (!cycles.length) return null;

  const open = (linkId: string) => router.push(`/team/reviews/${linkId}`);

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Date</th>
            <th>Sides</th>
            <th>Status</th>
            <th>Decision</th>
          </tr>
        </thead>
        <tbody>
          {cycles.map((c) => (
            <tr
              key={c.linkId}
              className="is-clickable"
              role="link"
              tabIndex={0}
              aria-label={`Open ${REVIEW_TYPE_LABEL[c.reviewType] ?? "review"}`}
              onClick={() => open(c.linkId)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  open(c.linkId);
                }
              }}
            >
              <td>{REVIEW_TYPE_LABEL[c.reviewType] ?? "Review"}</td>
              <td>{c.date ? formatDate(c.date) : <span className="admin-cell-muted">—</span>}</td>
              <td className="admin-cell-muted">
                {[c.hasSelf ? "Self" : null, c.hasManager ? "Manager" : null]
                  .filter(Boolean)
                  .join(" + ") || "—"}
              </td>
              <td>
                <Badge tone={statusTone(c.status)}>{humanize(c.status)}</Badge>
              </td>
              <td>
                {c.decision ? (
                  DECISION_LABEL[c.decision] ?? c.decision
                ) : c.keeper !== null ? (
                  c.keeper ? (
                    <Badge tone="ok">Keeper</Badge>
                  ) : (
                    "—"
                  )
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
