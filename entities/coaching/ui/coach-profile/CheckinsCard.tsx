"use client";

import type { CoachProfileDetail } from "@/entities/coaching/lib/data/profile";
import { type RenderedHtml } from "./shared";
import { formatDate } from "@/kernel/ui/format";

export function CheckinsCard({ detail, html }: { detail: CoachProfileDetail; html: RenderedHtml }) {
  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">Check-ins</div>
      {detail.checkins.length === 0 && (
        <div className="admin-empty">No check-ins yet. Mid-cycle pulses between 1-1s appear here.</div>
      )}
      {detail.checkins.map((c) => (
        <details open key={c.id} className="admin-coach-trend">
          <summary>
            <strong>{c.sentAt ? formatDate(c.sentAt) : "-"}</strong>
            {!c.respondedAt && <span className="admin-badge admin-badge--warn">awaiting their update</span>}
          </summary>
          {html.checkins[c.id] ? (
            <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: html.checkins[c.id]! }} />
          ) : (
            <div className="admin-cell-muted">Empty.</div>
          )}
        </details>
      ))}
    </section>
  );
}
