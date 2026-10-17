"use client";

import type { CoachingPriority } from "@/entities/coaching/lib/data/goals";

// The member's growth priorities, read-only: personal growth, not a scorecard.
export function MyPriorities({ priorities, coachName }: { priorities: CoachingPriority[]; coachName: string | null }) {
  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">Your growth priorities</div>
      <div className="admin-hint">
        What {coachName ?? "your coach"} wants you to focus on for your growth. Reviewed every 1-1, not a scorecard.
      </div>
      {priorities.length === 0 ? (
        <div className="admin-empty">No growth priorities set yet. Shape them together in your next 1-1.</div>
      ) : (
        <ul className="admin-mycoach-priorities">
          {priorities.map((p) => (
            <li key={p.id}>
              <strong>{p.title}</strong>
              {p.detailMarkdown ? <span className="admin-cell-muted">: {p.detailMarkdown}</span> : null}
              {/* One thing to go and do about it (L.6). rel=noreferrer as well
                  as noopener: these point off our own site, and the referrer
                  would otherwise tell the destination which coaching page the
                  reader came from. */}
              {p.link && (
                <a
                  className="admin-coach-priority-link"
                  href={p.link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ↗ {p.link.title}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
