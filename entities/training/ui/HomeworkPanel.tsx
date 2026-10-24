"use client";

// The session's homework, for the organiser (English Program PR 4): set or
// replace the one assignment (prompt, due time, the kinds it takes), withdraw
// it, and see who handed in what. The submission itself opens through a
// short-lived signed link; nothing about a learner's stars or review is here.
import { useState } from "react";
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import type { Result } from "@/kernel/data/result";
import { KINDS, KIND_LABEL, type SubmissionKind } from "@/entities/training/lib/assignment-rules";
import type { Assignment, Submission } from "@/entities/training/lib/assignments";
import { formParts, whenLabel } from "@/entities/training/lib/training-format";
import { ActionNote } from "./ActionNote";
import { SubmissionLine } from "./SubmissionLine";

export type HomeworkView = { assignment: Assignment; submissions: (Submission & { personId: string; name: string })[] } | null;

// A due time as the form holds it: a Vietnam date and time.
function dueParts(iso: string | null, fallbackDate: string): { date: string; time: string } {
  if (!iso) return { date: fallbackDate, time: "18:00" };
  const p = formParts(iso, iso);
  return { date: p.date, time: p.start };
}

export function HomeworkPanel({
  sessionId,
  homework,
  people,
  defaultDate,
  suggestion,
  mayEdit,
  actions,
}: {
  sessionId: string;
  homework: HomeworkView;
  people: { id: string; name: string }[];
  defaultDate: string;
  suggestion: string | null;
  mayEdit: boolean;
  actions: { set: (id: string, input: unknown) => Promise<Result>; withdraw: (id: string) => Promise<Result>; open: (path: string) => Promise<{ ok: true; url: string } | { ok: false; error: string }> };
}) {
  const [editing, setEditing] = useState(homework === null);
  const [prompt, setPrompt] = useState(homework?.assignment.prompt ?? suggestion ?? "");
  const [due, setDue] = useState(dueParts(homework?.assignment.dueAt ?? null, defaultDate));
  const [accepts, setAccepts] = useState<SubmissionKind[]>(homework?.assignment.accepts ?? ["recording", "link"]);
  const { note, pending, run } = useActionRunner();
  const toggle = (k: SubmissionKind) => setAccepts((a) => (a.includes(k) ? a.filter((x) => x !== k) : [...a, k]));
  const save = () => run(() => actions.set(sessionId, { prompt, dueAt: `${due.date}T${due.time}:00+07:00`, accepts }), "Homework set. Each learner is told.", () => setEditing(false));
  const byPerson = new Map((homework?.submissions ?? []).map((s) => [s.personId, s]));

  return (
    <section className="admin-card admin-section-card tr-card" aria-label="Homework">
      <div className="tr-card-head">
        <div>
          <h2 className="tr-card-title">Homework for next session</h2>
          {homework && !editing && <p className="tr-hint">Due {whenLabel(homework.assignment.dueAt, homework.assignment.dueAt).split(" · ").slice(0, 2).join(" · ")} · accepts {homework.assignment.accepts.map((k) => KIND_LABEL[k].toLowerCase()).join(", ")}</p>}
        </div>
        {mayEdit && homework && !editing && (
          <div className="tr-row-actions">
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => setEditing(true)}>
              Change
            </button>
            <ConfirmButton className="admin-btn admin-btn--sm" label="Withdraw" title="Withdraw the homework?" body="It comes off each learner's My Training. Submissions already made stay." confirmLabel="Withdraw" onConfirm={() => actions.withdraw(sessionId)} />
          </div>
        )}
      </div>
      {homework && !editing && <p className="tr-phil-text">{homework.assignment.prompt}</p>}
      {editing && mayEdit && (
        <div className="admin-form tr-phil-form">
          {suggestion && !homework && <p className="tr-hint">Claude&rsquo;s suggestion is filled in. Edit it or write your own.</p>}
          <label className="admin-field">
            <span className="admin-label">What to do</span>
            <textarea className="admin-textarea" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={2000} />
          </label>
          <div className="admin-form-row">
            <label className="admin-field">
              <span className="admin-label">Due date</span>
              <input className="admin-input" type="date" value={due.date} onChange={(e) => setDue({ ...due, date: e.target.value })} />
            </label>
            <label className="admin-field">
              <span className="admin-label">Due time (Vietnam)</span>
              <input className="admin-input" type="time" value={due.time} onChange={(e) => setDue({ ...due, time: e.target.value })} />
            </label>
          </div>
          <div className="admin-field">
            <span className="admin-label">Accepts</span>
            <div className="tr-chips" role="group" aria-label="Accepts">
              {KINDS.map((k) => (
                <button key={k} type="button" className={`tr-chip${accepts.includes(k) ? " is-on" : ""}`} aria-pressed={accepts.includes(k)} onClick={() => toggle(k)}>
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </div>
          <div className="admin-form-actions">
            <ActionNote note={note} />
            {homework && (
              <button type="button" className="admin-btn" onClick={() => setEditing(false)} disabled={pending}>
                Cancel
              </button>
            )}
            <button type="button" className="admin-btn admin-btn--primary" onClick={save} disabled={pending || !prompt.trim() || accepts.length === 0}>
              {homework ? "Save" : "Set homework"}
            </button>
          </div>
        </div>
      )}
      {homework && (
        <ul className="tr-phil-lines tr-homework-list">
          {people.map((p) => (
            <li key={p.id}>
              {p.name}: <SubmissionLine submission={byPerson.get(p.id) ?? null} open={actions.open} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
