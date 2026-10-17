"use client";

import type { ReactNode } from "react";

// The review history itself is team's — performance_reviews is its table and
// ReviewHistoryTable its component — so the coaching route renders it and hands
// it down as a node. Importing it here would make coaching's door graph reach
// team's, and team already reads coaching's goals and profiles (RS-12).
export function PerformanceCard({
  memberName,
  reviewCount,
  history,
}: {
  memberName: string;
  reviewCount: number;
  history: ReactNode;
}) {
  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">
        Performance reviews{" "}
        <span className="admin-cell-muted">system of record</span>
      </div>
      {reviewCount === 0 ? (
        <div className="admin-hint">
          No review cycles yet for {memberName}. Self-assessments and manager reviews appear here
          once opened.
        </div>
      ) : (
        <>
          <div className="admin-hint">
            Every self-assessment and manager review for {memberName}. Open a row to read both sides.
          </div>
          {history}
        </>
      )}
    </section>
  );
}
