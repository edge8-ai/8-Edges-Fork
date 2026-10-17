import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge, type BadgeTone } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import {
  listReviews,
  reviewSurveySlug,
  REVIEW_TYPE_LABEL,
  DECISION_LABEL,
  RATER_LABEL,
  type ReviewListItem,
} from "@/entities/team/lib/reviews";

export const metadata = {
  title: "Reviews",
  description: "Performance reviews: yours, and your reports'.",
};

function statusBadge(status: string): { label: string; tone: BadgeTone } {
  switch (status) {
    case "open":
    case "draft":
      return { label: "To do", tone: "warn" };
    case "submitted":
      return { label: "Submitted", tone: "info" };
    case "finalized":
      return { label: "Finalized", tone: "ok" };
    default:
      return { label: status, tone: "neutral" };
  }
}

function ReviewTable({
  rows,
  showSubject,
  emptyText,
}: {
  rows: ReviewListItem[];
  showSubject: boolean;
  emptyText: string;
}) {
  if (rows.length === 0) {
    return <p className="admin-hint">{emptyText}</p>;
  }
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            {showSubject && <th>Who</th>}
            <th>Type</th>
            <th>Rater</th>
            <th>Status</th>
            <th>Submitted</th>
            <th>Decision</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const badge = statusBadge(r.status);
            const fillable = r.status === "open" || r.status === "draft";
            const href = fillable
              ? `/surveys/${reviewSurveySlug({ rater_kind: r.raterKind, review_type: r.reviewType })}?review=${r.id}`
              : `/team/reviews/${r.id}`;
            return (
              <tr key={r.id}>
                {showSubject && <td>{r.subjectName}</td>}
                <td>{REVIEW_TYPE_LABEL[r.reviewType] ?? "Review"}</td>
                <td>{RATER_LABEL[r.raterKind] ?? r.raterKind}</td>
                <td>
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                </td>
                <td>{r.submittedAt ? formatDate(r.submittedAt) : ""}</td>
                <td>{r.decision ? (DECISION_LABEL[r.decision] ?? r.decision) : ""}</td>
                <td>
                  <Link href={href}>
                    {fillable ? (r.raterKind === "self" ? "Start self-assessment" : "Start review") : "View"}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// /team/reviews — the actor's review home. Everything below is scoped to the
// actor's own team_member id (as subject or as reviewer-of-record) inside
// lib/reviews.ts; no client-supplied ids reach a query unchecked.
export default async function TeamReviewsPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("team.performance");
  const actor = await requireTeamMember();
  const lists = await listReviews(actor);
  const isReviewer = lists.todo.some((r) => r.raterKind !== "self") || lists.reports.length > 0;

  return (
    <>
      <PageHead
        eyebrow="Me"
        title="Reviews"
        sub="Performance Pulse: the same scale every cycle, so the trend is real."
      />

      <div className="admin-card u-mb-4 u-p-4">
        <div className="admin-card-title">To do</div>
        <ReviewTable rows={lists.todo} showSubject emptyText="Nothing to fill in right now." />
      </div>

      {isReviewer && (
        <div className="admin-card u-mb-4 u-p-4">
          <div className="admin-card-title">My reports</div>
          <p className="admin-hint">
            Submitted reviews wait here for you to finalize. Your report sees a review only once it is
            finalized.
          </p>
          <ReviewTable rows={lists.reports} showSubject emptyText="No submitted reviews for your reports." />
        </div>
      )}

      <div className="admin-card u-p-4">
        <div className="admin-card-title">My reviews</div>
        <ReviewTable
          rows={lists.mine}
          showSubject={false}
          emptyText="No finalized reviews yet. Your manager's review appears here once it is finalized."
        />
      </div>
    </>
  );
}
