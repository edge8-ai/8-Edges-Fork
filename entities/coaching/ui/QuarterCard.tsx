"use client";

import { formatDate } from "@/kernel/ui/format";
import type { QuarterReview } from "@/entities/coaching/lib/quarter-review";

// The quarter, on one card (L.11).
//
// The review page already holds everything; this is the part somebody would
// actually show another person — the goal, what moved, and three moments —
// sized and laid out to survive being screenshotted.
//
// Private by default and shared only by the member choosing to: there is no
// share button, no link generation and nothing posted anywhere. The sharing
// mechanism is that it looks right in a screenshot, which is also the only
// mechanism anybody uses.
//
// Nothing on it is a figure about a person. "Six 1-1s" counts meetings and
// "19 kept" counts cards; neither is a rate, a rank or a comparison, and there
// is deliberately no percentage anywhere on the card.

export function QuarterCard({ review, memberName }: { review: QuarterReview; memberName: string | null }) {
  const goal = review.goals[0] ?? null;
  // Three, because a card people screenshot has room for three. Newest first,
  // since the end of a quarter is what somebody is talking about when they
  // share it.
  const moments = review.notes.slice(0, 3);

  return (
    <section className="coach-quarter-card">
      <div className="coach-quarter-card-head">
        <span className="admin-eyebrow admin-eyebrow--growth">{review.heading}</span>
        {memberName && <span className="admin-cell-muted">{memberName}</span>}
      </div>

      {goal ? (
        <div className="coach-quarter-card-goal">
          <div className="coach-quarter-card-goal-title">{goal.title}</div>
          <div className="admin-cell-muted">{formatDate(review.from)} to {formatDate(review.to)}</div>
        </div>
      ) : (
        <div className="coach-quarter-card-goal">
          <div className="coach-quarter-card-goal-title">A quarter without a written goal</div>
        </div>
      )}

      <div className="coach-quarter-card-facts">
        <span>
          <strong>{review.meetings.length}</strong> 1-1{review.meetings.length === 1 ? "" : "s"}
        </span>
        <span>
          <strong>{review.kept}</strong> commitments kept
        </span>
      </div>

      {moments.length > 0 && (
        <ul className="coach-quarter-card-moments">
          {moments.map((n) => (
            <li key={`${n.on}-${n.body.slice(0, 24)}`}>{n.body}</li>
          ))}
        </ul>
      )}

      <p className="coach-quarter-card-foot">Yours. Screenshot it if you want to show someone.</p>
    </section>
  );
}
