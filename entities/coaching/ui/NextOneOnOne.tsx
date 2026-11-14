"use client";

import { useState, useTransition } from "react";
import type { PreMeeting } from "@/entities/coaching/lib/types";
import type { Commitment } from "@/entities/coaching/lib/data/rows";
import { saveMyPreMeetingAnswers } from "@/entities/coaching/lib/premeeting-actions";
import { formatDate } from "@/kernel/ui/format";
import { AmendablePrep } from "./AmendablePrep";
import type { PrepEdits } from "@/entities/coaching/lib/prep-edits";
import { QuestionPrompts } from "@/entities/coaching/ui/QuestionPrompts";
import { PlannedDrafts, RecentNotes } from "@/entities/coaching/ui/RecentNotes";

// The ninety seconds before a 1-1 (K.15, spec 2.3). Three optional fields, one
// Save, and the shared agenda underneath with the member's own words at the top
// of it. Optional is the whole design: the meeting covers the three headings
// either way, so the empty state is answered with "your coach will ask anyway"
// rather than a nag. Nothing here describes the person; it is what they chose
// to say about their work.

const FIELDS = [
  {
    key: "moved",
    label: "What moved since last time",
    hint: "One line is enough. A win, a shipped thing, a conversation that landed.",
  },
  {
    key: "stuck",
    label: "What is stuck",
    hint: "Where you would take help. Naming it early is what makes the hour useful.",
  },
  {
    key: "talk",
    label: "What I want to talk about",
    hint: "Anything: a decision, a worry, a direction, an idea you keep circling.",
  },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];

// The upcoming 1-1 as the page knows it: its date and time, the coach's shared
// prep rendered and raw (K.21 amends the raw list), the member's edits, and
// whether the form is open, decided on the server in Saigon time.
export type NextMeeting = {
  heldOn: string;
  startsAt: string | null;
  agendaHtml: string | null;
  agendaMarkdown: string | null;
  agendaEdits: PrepEdits;
  formOpen: boolean;
};

export function NextOneOnOne({
  next,
  coachName,
  preMeeting,
  commitments,
  recentNotes,
  movedCards,
}: {
  // The upcoming 1-1: its date, the shared half of the coach's prep rendered on
  // the server, and whether the form is open. The agenda opens four days out,
  // decided on the server so the date maths runs in Saigon time, once.
  // agendaMarkdown is the coach's shared prep raw, for the amendable list (K.21).
  next: NextMeeting;
  coachName: string | null;
  preMeeting: PreMeeting;
  // The board, read only for the Blocked cards: they become the PLACEHOLDER of
  // "What is stuck", never its value, because a pre-filled answer is the
  // board's words and would be saved as if the member had written them.
  commitments: Commitment[];
  // What the member wrote for themselves since the last held 1-1 (K.19),
  // newest first. Offered as a draft under "What moved"; the server decides
  // which notes are recent, because the cut-off is a Saigon date comparison.
  recentNotes: string[];
  // Titles of Workboard cards the member finished in the same window (K.20),
  // newest first. Offered beside the notes as a draft under "What moved", never
  // as a count, and never saved unless the member keeps a line.
  movedCards: string[];
}) {
  const { heldOn, agendaMarkdown, agendaEdits, formOpen } = next;
  const [answers, setAnswers] = useState(preMeeting.answers);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!formOpen) {
    return (
      <section className="admin-card admin-coach-section">
        <div className="admin-card-title">Your next 1-1: {formatDate(heldOn)}</div>
        <div className="admin-hint">
          Your next 1-1 is {formatDate(heldOn)}. The agenda opens four days before.
        </div>
      </section>
    );
  }

  const blocked = commitments.filter((c) => c.status === "blocked");
  // What the member said they would do, on the cards still open (L.1). Dropped
  // ones are gone and kept ones are answered, so neither has a plan worth
  // raising; what is left is a promise with a moment attached that the 1-1 can
  // actually be about.
  const plannedLines = commitments
    .filter((c) => c.planMd && c.status !== "completed" && c.status !== "dropped")
    .map((c) => `${c.title} - ${c.planMd}`);
  const stuckPlaceholder =
    blocked.length > 0
      ? blocked.map((b) => (b.statusNote?.trim() ? `${b.title} - ${b.statusNote.trim()}` : b.title)).join("\n")
      : "Where you would take help.";

  const save = () => {
    setToast(null);
    setError(null);
    startTransition(async () => {
      const res = await saveMyPreMeetingAnswers(answers.moved, answers.stuck, answers.talk);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const anything = Boolean(answers.moved.trim() || answers.stuck.trim() || answers.talk.trim());
      setToast(
        anything
          ? "Saved. On your coach's prep in your words."
          : "Saved. Empty is fine; your coach will ask anyway.",
      );
    });
  };

  const set = (key: FieldKey, value: string) => setAnswers((a) => ({ ...a, [key]: value }));

  // A picked question joins what the member already wrote rather than replacing
  // it, on its own line, because the field is a list of things to raise.
  const appendTalk = (question: string) =>
    setAnswers((a) => ({ ...a, talk: a.talk.trim() ? `${a.talk.replace(/\s+$/, "")}\n${question}` : question }));

  // Same appending shape for a note the member chose to reuse: it joins what is
  // already in "What moved" on its own line rather than replacing it.
  const appendMoved = (note: string) =>
    setAnswers((a) => ({ ...a, moved: a.moved.trim() ? `${a.moved.replace(/\s+$/, "")}\n${note}` : note }));

  const written = [
    answers.moved.trim() ? { label: "What moved since last time", body: answers.moved.trim() } : null,
    answers.stuck.trim() ? { label: "What is stuck", body: answers.stuck.trim() } : null,
    answers.talk.trim() ? { label: "What I want to talk about", body: answers.talk.trim() } : null,
  ].filter((x): x is { label: string; body: string } => x !== null);

  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">Your next 1-1: {formatDate(heldOn)}</div>
      <div className="admin-hint">
        Ninety seconds, all of it optional. {coachName ?? "Your coach"} covers these three either way, so
        writing something just means the hour starts where you left off.
      </div>

      {preMeeting.coachNote && (
        <div className="admin-mycoach-coach-note">
          <span className="admin-eyebrow">{coachName ?? "Your coach"} wrote back</span>
          <div>{preMeeting.coachNote}</div>
        </div>
      )}

      {FIELDS.map((f) => (
        <div key={f.key} className="admin-mycoach-premeeting-field">
          <label className="admin-label" htmlFor={`premeeting-${f.key}`}>
            {f.label}
          </label>
          <div className="admin-hint">{f.hint}</div>
          <textarea
            id={`premeeting-${f.key}`}
            className="admin-input"
            rows={3}
            value={answers[f.key]}
            onChange={(e) => set(f.key, e.target.value)}
            placeholder={f.key === "stuck" ? stuckPlaceholder : undefined}
          />
          {preMeeting.previous?.[f.key] && (
            <div className="admin-cell-muted">Last time you wrote: {preMeeting.previous[f.key]}</div>
          )}
          {f.key === "moved" && <RecentNotes notes={recentNotes} cards={movedCards} onUse={appendMoved} />}
          {f.key === "talk" && <PlannedDrafts lines={plannedLines} onUse={appendTalk} />}
          {f.key === "talk" && <QuestionPrompts onPick={appendTalk} />}
        </div>
      ))}

      <div className="admin-form-actions">
        <button type="button" className="admin-btn" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save"}
        </button>
        {toast && <span className="admin-cell-muted">{toast}</span>}
      </div>
      {error && <div className="admin-alert admin-alert--err">{error}</div>}

      <div className="admin-coach-block">
        <span className="admin-eyebrow">The agenda for this 1-1</span>
        {written.length > 0 && (
          <ul className="admin-mycoach-premeeting-agenda">
            {written.map((w) => (
              <li key={w.label}>
                <strong>{w.label}:</strong> {w.body}
              </li>
            ))}
          </ul>
        )}
        {/* The coach's half as a list the member can strike or add to (K.21). */}
        <AmendablePrep markdown={agendaMarkdown} edits={agendaEdits} coachName={coachName} />
      </div>
    </section>
  );
}
