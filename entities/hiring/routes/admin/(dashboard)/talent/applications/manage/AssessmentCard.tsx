"use client";

import { EditableTextarea } from "@/kernel/ui/InlineEdit";
import { updateApplication } from "@/entities/hiring/lib/application-actions";
import { ok, AI_COLLAPSED_HEIGHT } from "./shared";

export function AssessmentCard({ appId, hrAssessment }: { appId: string; hrAssessment: string | null }) {
  return (
    <section className="admin-card admin-section-card admin-record-assessment">
      <div className="admin-section-label u-row u-gap-3 u-between u-mb-1">
        <span>HR assessment</span>
        <span className="admin-cell-muted u-label">
          your read
        </span>
      </div>
      <div className="admin-hint u-mb-3">
        Your own read on this candidate. Separate from the AI screen and interview scorecards.
      </div>
      <EditableTextarea
        value={hrAssessment ?? ""}
        rows={6}
        collapsedHeight={AI_COLLAPSED_HEIGHT}
        placeholder="Strengths, concerns, anything the interview surfaced that the resume missed…"
        ariaLabel="HR assessment"
        onSave={(v) => updateApplication(appId, { hr_assessment: v.trim() || null }).then((r) => (r.ok ? ok() : r))}
      />
    </section>
  );
}
