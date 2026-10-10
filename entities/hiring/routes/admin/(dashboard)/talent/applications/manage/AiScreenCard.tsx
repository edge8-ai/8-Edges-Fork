"use client";

import { formatDate } from "@/kernel/ui/format";
import { Expandable } from "@/kernel/ui/Expandable";
import { type ApplicationExtras } from "../actions";
import { AI_COLLAPSED_HEIGHT } from "./shared";

// The AI screen: score, overview, and extracted skills. Read-only; the recruiter
// overrides its English/salary/notice values in the Signals rail, not here.
export function AiScreenCard({ extras, resumeDocumentId }: { extras: ApplicationExtras; resumeDocumentId: string | null }) {
  if (!extras.aiStatus && !extras.aiSummary) return null;
  const s = extras.aiSummary;
  return (
    <section className="admin-card admin-section-card">
      <div className="admin-section-label u-row u-gap-3 u-between u-mb-3">
        <span>AI screen</span>
        <span className="u-row u-gap-3 u-label">
          {extras.aiScreenedAt && <span className="admin-cell-muted">{formatDate(extras.aiScreenedAt)}</span>}
          {resumeDocumentId && (
            <a href={`/admin/talent/resume/${resumeDocumentId}`} target="_blank" rel="noreferrer">
              Resume ↗
            </a>
          )}
        </span>
      </div>
      {extras.aiStatus === "failed" && extras.aiError && (
        <div className="admin-alert admin-alert--err">Scan failed: {extras.aiError}</div>
      )}
      {extras.aiStatus === "pending" && <div className="admin-hint">Screen in progress…</div>}
      {s ? (
        <div className="u-stack u-gap-3">
          {extras.aiRating != null && (
            <div className="admin-record-ai-score">
              {extras.aiRating}
              <span>/5</span>
            </div>
          )}
          <Expandable collapsedHeight={AI_COLLAPSED_HEIGHT}>
          <div className="u-stack u-gap-3">
          <div className="u-ink-2 u-prewrap u-max-prose">{s.overview}</div>
          {s.skills.length > 0 && (
            <ul className="admin-record-ai-points">
              {s.skills.map((sk, j) => {
                // The model writes many points as "Label: detail" — bold the label.
                // These are full sentences, not tags, so they wrap as a list. Tint
                // each by sentiment (strength vs concern) to echo the screen chips.
                const c = sk.indexOf(": ");
                const label = c > 0 && c < 48 ? sk.slice(0, c) : null;
                const neg = /\b(gaps?|concerns?|risks?|no |not |lack|limited|missing|weak|inconsisten|unclear|reliab|however|but )/i.test(
                  label ?? sk,
                );
                return (
                  <li key={j} className={`admin-record-ai-point admin-record-ai-point--${neg ? "neg" : "pos"}`}>
                    {label ? (
                      <>
                        <strong>{label}:</strong>
                        {sk.slice(c + 1)}
                      </>
                    ) : (
                      sk
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          </div>
          </Expandable>
        </div>
      ) : (
        extras.aiStatus !== "failed" && extras.aiStatus !== "pending" && <div className="admin-hint">No screen result yet.</div>
      )}
    </section>
  );
}
