"use client";

import type { CoachProfileDetail } from "@/entities/coaching/lib/data/profile";
import { runTrendReport } from "@/entities/coaching/lib/actions";
import { type RenderedHtml, type ActionResult, STORED_NOT_SHOWN_NOTE } from "./shared";
import { formatDate } from "@/kernel/ui/format";

export function TrendsCard({
  detail,
  html,
  run,
  busy,
}: {
  detail: CoachProfileDetail;
  html: RenderedHtml;
  run: (label: string, fn: () => Promise<ActionResult>, onOk?: () => void) => void;
  busy: boolean;
}) {
  const summarized = detail.meetings.filter((m) => m.status === "held" && m.summaryMarkdown).length;
  const canRun = summarized >= 2;

  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">
        Trend report <span className="admin-cell-muted">across the last 3 1-1s</span>
      </div>
      <div className="admin-hint">
        A read across the recent 1-1s: trajectory, recurring themes, follow-through, mode split, and what to coach next.
        Needs at least 2 summarized 1-1s.
      </div>
      <div className="admin-form-actions">
        <button
          className="admin-btn"
          disabled={busy || !canRun}
          onClick={() => run("Trend report", () => runTrendReport(detail.profileId))}
        >
          Run trend report
        </button>
      </div>
      {detail.trends.length === 0 ? (
        <div className="admin-empty">
          {canRun
            ? "No trend report yet. Run one across the last 3 1-1s."
            : "A trend report needs at least 2 summarized 1-1s."}
        </div>
      ) : (
        // Stored, not shown: the report body is no longer the body of the tab.
        // The note is what the tab says; "Show anyway" is the escape hatch, so
        // nothing generated is lost, it is just not the thing you read first.
        <>
          <div className="admin-cell-muted">{STORED_NOT_SHOWN_NOTE}</div>
          {detail.trends.map((t) => (
            <details open key={t.id} className="admin-coach-trend">
              <summary>
                Show anyway: trend as of {t.createdAt ? formatDate(t.createdAt) : "-"}
                {t.aiError && <span className="admin-badge admin-badge--err">failed</span>}
              </summary>
              {html.trends[t.id] ? (
                <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: html.trends[t.id]! }} />
              ) : (
                <div className="admin-cell-muted">{t.aiError ?? "Empty."}</div>
              )}
            </details>
          ))}
        </>
      )}
    </section>
  );
}
