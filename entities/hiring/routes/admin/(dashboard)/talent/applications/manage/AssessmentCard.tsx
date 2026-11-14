"use client";

import { EditableTextarea } from "@/kernel/ui/InlineEdit";
import { updateApplication } from "@/entities/hiring/lib/application-actions";
import { AtsSectionHead } from "@/kernel/ui/talent";
import { ok, AI_COLLAPSED_HEIGHT } from "./shared";
import { HeaderStars } from "./HeaderStars";

// HR's own read, in two parts: the rating and the notes. The stars used to sit
// in the page header, far from this box, so the rating got typed into the notes
// ("RATING: 4/5") and the lists, which read the rating field, showed nothing.
// The stars are that same field, moved here.
export function AssessmentCard({
  appId,
  hrAssessment,
  rating,
  onRate,
}: {
  appId: string;
  hrAssessment: string | null;
  rating: number | null;
  onRate: (v: number | null) => void;
}) {
  return (
    <section className="admin-card admin-section-card admin-record-assessment">
      <AtsSectionHead k="Your read" title="HR assessment" />
      <div className="admin-hint">Your own read on this candidate. Separate from the AI screen and interview scorecards.</div>
      <div className="ats-field">
        <span className="ats-field-k">Your rating</span>
        <div className="ats-rating">
          <HeaderStars value={rating} onChange={onRate} />
          <span className="ats-rating-n">{rating != null ? `${rating} of 5` : "Not rated yet"}</span>
        </div>
      </div>
      <div className="ats-field">
        <span className="ats-field-k">Your notes</span>
        <EditableTextarea
          value={hrAssessment ?? ""}
          rows={6}
          collapsedHeight={AI_COLLAPSED_HEIGHT}
          placeholder="Why you gave that rating: strengths, concerns, what the interview surfaced. The rating itself goes in the stars above."
          ariaLabel="HR assessment notes"
          onSave={(v) => updateApplication(appId, { hr_assessment: v.trim() || null }).then((r) => (r.ok ? ok() : r))}
        />
      </div>
    </section>
  );
}
