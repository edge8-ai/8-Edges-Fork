"use client";

import { formatDate } from "@/kernel/ui/format";
import { Expandable } from "@/kernel/ui/Expandable";
import { type ApplicationExtras } from "../actions";
import { AtsSectionHead } from "@/kernel/ui/talent";
import { AI_COLLAPSED_HEIGHT } from "./shared";

// The AI screen: score, overview, and extracted skills. Read-only; the recruiter
// overrides its English/salary/notice values in the Signals rail, not here.
export function AiScreenCard({ extras, resumeDocumentId }: { extras: ApplicationExtras; resumeDocumentId: string | null }) {
  if (!extras.aiStatus && !extras.aiSummary) return null;
  const s = extras.aiSummary;
  return (
    <section className="admin-card admin-section-card">
      <AtsSectionHead
        k={extras.aiScreenedAt ? `The machine's read · ${formatDate(extras.aiScreenedAt)}` : "The machine's read"}
        title="AI screen"
        aside={
          <>
            {resumeDocumentId && (
              <a href={`/admin/talent/resume/${resumeDocumentId}`} target="_blank" rel="noreferrer">
                Open resume ↗
              </a>
            )}
            {extras.aiRating != null && (
              // Under 2.5 reads as a concern and 4 or more as a strength, the same
              // split the points below are tinted by.
              <span className={`ats-score${extras.aiRating < 2.5 ? " ats-score--low" : extras.aiRating >= 4 ? " ats-score--high" : ""}`}>
                <b>{extras.aiRating}</b>
                <span>of 5</span>
              </span>
            )}
          </>
        }
      />
      {extras.aiStatus === "failed" && extras.aiError && (
        <div className="admin-alert admin-alert--err">Scan failed: {extras.aiError}</div>
      )}
      {extras.aiStatus === "pending" && <div className="admin-hint">Screen in progress…</div>}
      {s ? (
        <div className="u-stack u-gap-3">
          <Expandable collapsedHeight={AI_COLLAPSED_HEIGHT}>
          <div className="u-stack u-gap-3">
          <div className="ats-prose">{s.overview}</div>
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
