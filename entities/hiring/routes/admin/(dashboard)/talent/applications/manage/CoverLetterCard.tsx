"use client";

import { type ApplicationExtras } from "../actions";

export function CoverLetterCard({ extras }: { extras: ApplicationExtras }) {
  return (
    <section className="admin-card admin-section-card">
      <div className="admin-section-label u-mb-2">Application</div>
      {extras.coverLetter && (
        <details open className={extras.answers.length ? "u-mb-3" : undefined}>
          <summary className="u-mb-2 u-strong u-pointer">Cover letter</summary>
          <div className="u-pl-3 admin-quote u-ink-2 u-prewrap u-max-prose">
            {extras.coverLetter}
          </div>
        </details>
      )}
      {extras.answers.map((x, i) => (
        <div key={i} className="u-mb-3">
          <div className="admin-label u-mb-2">{x.q}</div>
          <div className="u-pl-3 admin-quote u-ink-2 u-prewrap u-max-prose">
            {x.a || "—"}
          </div>
        </div>
      ))}
    </section>
  );
}
