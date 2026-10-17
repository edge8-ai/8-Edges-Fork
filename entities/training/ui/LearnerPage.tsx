"use client";

// One learner in one plan, for the organiser (English Program PR 4): the
// living note (strong, weak, focus) the learner reads, their attendance with
// its source, and what they handed in. Nothing here is a star, a load, a skip
// reason or a review note (ADR 0016).
import { useState } from "react";
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import type { Result } from "@/kernel/data/result";
import type { LearnerNote } from "@/entities/training/lib/learner-notes";
import type { LearnerHomework, LearnerSession } from "@/entities/training/lib/learner-read";
import { whenLabel } from "@/entities/training/lib/training-format";
import { ActionNote } from "./ActionNote";
import { SubmissionLine } from "./SubmissionLine";

const SOURCE_LABEL = { member: "their word", transcript: "transcript", organiser: "set by you" } as const;

export function LearnerPage({
  planId,
  planTitle,
  personId,
  learnerName,
  note,
  sessions,
  homework,
  actions,
}: {
  planId: string;
  planTitle: string;
  personId: string;
  learnerName: string;
  note: LearnerNote | null;
  sessions: LearnerSession[];
  homework: LearnerHomework[];
  actions: { writeNote: (planId: string, personId: string, planTitle: string, input: unknown) => Promise<Result>; open: (path: string) => Promise<{ ok: true; url: string } | { ok: false; error: string }> };
}) {
  const [draft, setDraft] = useState({ strong: note?.strong ?? "", weak: note?.weak ?? "", focus: note?.focus ?? "" });
  const { note: msg, pending, run } = useActionRunner();
  const save = () => run(() => actions.writeNote(planId, personId, planTitle, draft), "Saved. The learner can read it.");
  return (
    <>
      <section className="admin-card admin-section-card tr-card" aria-label="Teacher's note">
        <div className="tr-card-head">
          <div>
            <h2 className="tr-card-title">Teacher&rsquo;s note</h2>
            <p className="tr-hint">
              Visible to {learnerName}. {note ? `Last saved ${whenLabel(note.writtenAt, note.writtenAt).split(" · ").slice(0, 2).join(" · ")}${note.versions > 1 ? ` · ${note.versions - 1} earlier ${note.versions === 2 ? "version" : "versions"}` : ""}` : "Not written yet."}
            </p>
          </div>
        </div>
        <div className="admin-form tr-phil-form">
          {(["strong", "weak", "focus"] as const).map((k) => (
            <label key={k} className="admin-field">
              <span className="admin-label">{k === "strong" ? "Strong" : k === "weak" ? "Weak" : "Focus now"}</span>
              <textarea className="admin-textarea" rows={2} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} maxLength={2000} />
            </label>
          ))}
          <div className="admin-form-actions">
            <ActionNote note={msg} />
            <button type="button" className="admin-btn admin-btn--primary" onClick={save} disabled={pending}>
              Save
            </button>
          </div>
        </div>
      </section>

      <section className="admin-card admin-section-card tr-card" aria-label="Attendance">
        <h2 className="tr-card-title">Attendance</h2>
        {sessions.length === 0 ? (
          <p className="tr-hint">No session has started yet.</p>
        ) : (
          <ul className="tr-log">
            {sessions.map((s) => (
              <li key={s.trainingId} className="tr-log-row tr-type-1">
                <div>
                  <div className="tr-row-title">{whenLabel(s.startsAt, s.endsAt)}</div>
                  <div className="tr-row-meta">
                    {s.status === "pending" ? "no word yet" : s.status} · {SOURCE_LABEL[s.source]}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="tr-hint">Correct a row on the session page. A correction is never overwritten by a transcript.</p>
      </section>

      <section className="admin-card admin-section-card tr-card" aria-label="Homework">
        <h2 className="tr-card-title">Homework</h2>
        {homework.length === 0 ? (
          <p className="tr-hint">Nothing set yet.</p>
        ) : (
          <ul className="tr-log">
            {homework.map((h) => (
              <li key={h.assignmentId} className="tr-log-row tr-type-2">
                <div>
                  <div className="tr-row-title">{h.prompt}</div>
                  <div className="tr-row-meta">
                    Due {whenLabel(h.dueAt, h.dueAt).split(" · ").slice(0, 2).join(" · ")} · <SubmissionLine submission={h.submission} open={actions.open} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
