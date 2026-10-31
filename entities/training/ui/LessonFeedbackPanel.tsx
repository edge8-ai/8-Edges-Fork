"use client";

// Each learner's English and the teacher's feedback on one lesson, for the
// lesson's teacher (ADR 0016, amended 2026-10-26). Claude's evaluation of the
// learner's English, read from the transcript, with Evaluate English or
// Re-evaluate; and the teacher's own feedback, one box per learner on the
// register. Neither reaches the learner while the evaluation is tested; admins
// read both on the Admin view's lesson page.
import { useState } from "react";
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import type { Result } from "@/kernel/data/result";
import { FEEDBACK_MAX, type EvaluationType } from "@/entities/training/lib/english-evaluation-rules";
import { ActionNote } from "./ActionNote";
import { EnglishEvaluation } from "./EnglishEvaluation";

export type FeedbackLearner = { id: string; name: string; attended: boolean; evaluation: EvaluationType | null; evaluatedAt: string | null; feedback: string | null };


function LearnerFeedback({ sessionId, learner, save }: { sessionId: string; learner: FeedbackLearner; save: (id: string, personId: string, text: string) => Promise<Result> }) {
  const [text, setText] = useState(learner.feedback ?? "");
  const { note, pending, run } = useActionRunner();
  const changed = text.trim() !== (learner.feedback ?? "").trim();
  return (
    <div className="admin-list-row">
      <div className="admin-list-main">
        <div className="admin-list-title">{learner.name}</div>
        {learner.evaluation ? (
          <EnglishEvaluation evaluation={learner.evaluation} evaluatedAt={learner.evaluatedAt} />
        ) : (
          <p className="admin-list-sub">{learner.attended ? "No evaluation: they did not speak in the transcript, or it has not run yet." : "Not marked attended, so not evaluated."}</p>
        )}
        <label className="admin-field u-mt-3">
          <span className="admin-label">Your feedback</span>
          <textarea className="admin-textarea" rows={3} maxLength={FEEDBACK_MAX} value={text} onChange={(e) => setText(e.target.value)} placeholder={`What ${learner.name} did well and what to work on next.`} />
        </label>
        <div className="admin-form-actions">
          <ActionNote note={note} />
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => run(() => save(sessionId, learner.id, text), "Feedback saved.")} disabled={pending || !changed}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export function LessonFeedbackPanel({
  sessionId,
  learners,
  hasTranscript,
  actions,
}: {
  sessionId: string;
  learners: FeedbackLearner[];
  hasTranscript: boolean;
  actions: { evaluate: (id: string) => Promise<Result>; save: (id: string, personId: string, text: string) => Promise<Result> };
}) {
  const { note, pending, run } = useActionRunner();
  const evaluated = learners.some((l) => l.evaluation !== null);
  return (
    <section className="admin-card admin-section-card tr-card" aria-label="English and feedback">
      <div className="tr-card-head">
        <div>
          <h2 className="tr-card-title">English and your feedback</h2>
          <p className="tr-hint">Claude&apos;s read of each learner&apos;s English from the transcript, and your own feedback. You and the admins see these; the learner does not.</p>
        </div>
        {hasTranscript && (
          <div className="tr-row-actions">
            {evaluated ? (
              <ConfirmButton
                label="Re-evaluate"
                className="admin-btn admin-btn--sm"
                title="Evaluate the English again?"
                body="Claude reads the transcript again and replaces every learner's evaluation. Your feedback stays as it is."
                confirmLabel="Re-evaluate"
                onConfirm={() => actions.evaluate(sessionId)}
              />
            ) : (
              <button type="button" className="admin-btn admin-btn--sm admin-btn--primary" onClick={() => run(() => actions.evaluate(sessionId), "Evaluated.")} disabled={pending}>
                {pending ? "Evaluating…" : "Evaluate English"}
              </button>
            )}
          </div>
        )}
      </div>
      <ActionNote note={note} />
      {!hasTranscript && <p className="tr-hint">The English is evaluated from the transcript, once there is one.</p>}
      {learners.length === 0 ? (
        <p className="tr-hint">Nobody is on this session&apos;s register.</p>
      ) : (
        <div className="admin-list">
          {learners.map((l) => (
            <LearnerFeedback key={l.id} sessionId={sessionId} learner={l} save={actions.save} />
          ))}
        </div>
      )}
    </section>
  );
}
