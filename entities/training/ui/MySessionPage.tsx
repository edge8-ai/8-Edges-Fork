"use client";

// The learner's session page (English Program PR 8). On a phone the order is
// the attendance chip, the homework with its four kinds, the recap, the
// materials, then the review, because the homework is the thing to do. On a
// laptop the same, in one column. The review reuses the tray's own row.
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import type { Result } from "@/kernel/data/result";
import type { MySession } from "@/entities/training/lib/my-session";
import { PLAN_STATE_LABEL } from "@/entities/training/lib/session-plan-rules";
import type { WordView } from "@/entities/training/lib/training-format";
import { whenLabel } from "@/entities/training/lib/training-format";
import { ActionNote } from "./ActionNote";
import { SubmitHomework, type HomeworkActions } from "./SubmitHomework";
import { SubmissionLine } from "./SubmissionLine";
import { TrainingWord, type WordActions } from "./TrainingWord";

type Actions = HomeworkActions & WordActions & { confirm: (trainingId: string, status: "attended" | "absent") => Promise<Result>; open: (path: string) => Promise<{ ok: true; url: string } | { ok: false; error: string }> };

const SOURCE_LABEL = { member: "your word", transcript: "from the transcript", organiser: "set by your teacher" } as const;
const STATUS_LABEL = { pending: "no word yet", attended: "you attended", skipped: "you skipped it", absent: "absent" } as const;

export function MySessionPage({ session: s, word, started, actions }: { session: MySession; word: WordView | null; started: boolean; actions: Actions }) {
  const { note, pending, run } = useActionRunner();
  const dueLabel = (iso: string) => whenLabel(iso, iso).split(" · ").slice(0, 2).join(" · ");
  return (
    <>
      {started && (
        <section className="tr-cool" aria-label="Attendance">
          <div className="tr-card-head">
            <div>
              <h2 className="tr-card-title">{STATUS_LABEL[s.attendance.status]}</h2>
              {s.attendance.status !== "pending" && <p className="tr-hint">{SOURCE_LABEL[s.attendance.source]}. Correct it below if the transcript got it wrong; your correction stays.</p>}
            </div>
            <div className="tr-cool-actions">
              {s.attendance.status !== "attended" && (
                <button type="button" className="admin-btn admin-btn--sm tr-btn-ink" onClick={() => run(() => actions.confirm(s.id, "attended"), "Noted: you were there.")} disabled={pending}>
                  I was there
                </button>
              )}
              {s.attendance.status !== "absent" && s.attendance.status !== "skipped" && (
                <button type="button" className="admin-btn admin-btn--sm" onClick={() => run(() => actions.confirm(s.id, "absent"), "Noted: you were not.")} disabled={pending}>
                  I was not
                </button>
              )}
            </div>
          </div>
          <ActionNote note={note} />
        </section>
      )}

      {s.homework && (
        <section className="admin-card admin-section-card tr-card" aria-label="Homework">
          <div className="tr-card-head">
            <div>
              <h2 className="tr-card-title">Homework · due {dueLabel(s.homework.assignment.dueAt)}</h2>
              <p className="tr-phil-text">{s.homework.assignment.prompt}</p>
            </div>
          </div>
          {s.homework.submission && (
            <p className="tr-hint">
              Submitted: <SubmissionLine submission={s.homework.submission} open={actions.open} />. Submit again to replace it.
            </p>
          )}
          <SubmitHomework assignmentId={s.homework.assignment.id} accepts={s.homework.assignment.accepts} actions={actions} />
        </section>
      )}

      {!started && (
        <section className="admin-card admin-section-card tr-card" aria-label="What we'll do">
          <h2 className="tr-card-title">What we&rsquo;ll do</h2>
          {s.blocks.length === 0 ? (
            <p className="tr-hint">{PLAN_STATE_LABEL[s.planState]}. The plan arrives the day before.</p>
          ) : (
            <ol className="tr-phil-lines">
              {s.blocks.map((b, i) => (
                <li key={i}>
                  {b.label} <span className="tr-phil-side">{b.side} · {b.minutes} min</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {started && (
        <section className="admin-card admin-section-card tr-card" aria-label="Recap">
          <h2 className="tr-card-title">Recap</h2>
          {s.recap ? (
            <div className="tr-phil">
              <div className="tr-phil-block">
                <span className="tr-label">What we covered</span>
                <p className="tr-phil-text">{s.recap.covered}</p>
              </div>
              {s.recap.mine && (
                <div className="tr-phil-block">
                  <span className="tr-label">For you</span>
                  <p className="tr-phil-text">{s.recap.mine}</p>
                </div>
              )}
              {s.recap.homeworkSuggestion && (
                <div className="tr-phil-block">
                  <span className="tr-label">To practise</span>
                  <p className="tr-phil-text">{s.recap.homeworkSuggestion}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="tr-hint">{s.recapState === "drafted" ? "Recap coming: your teacher is reading it." : "The recap arrives after the class, once your teacher approves it."}</p>
          )}
        </section>
      )}

      {s.materials.length > 0 && (
        <section className="admin-card admin-section-card tr-card" aria-label="Materials">
          <h2 className="tr-card-title">Materials</h2>
          <ul className="tr-phil-lines">
            {s.materials.map((m, i) => (
              <li key={i}>
                <a href={m.url} target="_blank" rel="noopener noreferrer">
                  {m.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {started && word && (
        <section className="admin-card admin-section-card tr-card" aria-label="Your review">
          <h2 className="tr-card-title">Your ten-second review</h2>
          <p className="tr-hint">Optional. Only the programme read sees it, never one person&rsquo;s.</p>
          <ul className="tr-cool-list">
            <TrainingWord row={word} place="tray" actions={actions} />
          </ul>
        </section>
      )}
    </>
  );
}
