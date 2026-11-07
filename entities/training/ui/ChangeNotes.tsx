"use client";

// "What changed" on the organiser's plan page (TR.8, the design Khoa approved
// on 3 Nov): what the learners say as one quiet line (the plan's top feelings
// from the programme read, or nothing until three people have reviewed), a
// post box with the organiser's face, and the notes below exactly as the
// learners see them, each removable. One plain action: no steps, no drawer.
import { useState } from "react";
import { Avatar } from "@/kernel/ui/Avatar";
import { initials } from "@/kernel/ui/format";
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import type { Result } from "@/kernel/data/result";
import type { ChangeNote, NoteInputType } from "../lib/change-notes";
import { ActionNote } from "./ActionNote";
import { ChangeCard } from "./ChangeCard";

const MAX = 600;

export function ChangeNotes({
  planId,
  organiserName,
  feelings,
  notes,
  actions,
}: {
  planId: string;
  organiserName: string;
  /** The plan's top feelings with their counts, or null while the read is hidden (under three reviewers). */
  feelings: { label: string; n: number; friction: boolean }[] | null;
  notes: ChangeNote[];
  actions: { post: (planId: string, input: NoteInputType) => Promise<Result>; remove: (planId: string, noteId: string) => Promise<Result> };
}) {
  const [draft, setDraft] = useState("");
  const { run, pending, note } = useActionRunner();
  const post = () => run(() => actions.post(planId, { body: draft }), "Posted to your learners.", () => setDraft(""));

  return (
    <section className="admin-card admin-section-card tr-card" aria-label="What changed">
      <div className="tr-card-head">
        <div>
          <h2 className="tr-card-title">What changed</h2>
          <p className="tr-hint">When the reviews make you change something, tell your learners here. It shows on their plan card in My Training.</p>
        </div>
      </div>
      <p className="tr-cn-heard">
        <span className="tr-cn-heard-k">Your learners say</span>
        {feelings === null ? (
          <span>nothing yet: their feelings show here once three people have reviewed.</span>
        ) : feelings.length === 0 ? (
          <span>no feelings picked in their reviews yet.</span>
        ) : (
          feelings.map((f) => (
            <span key={f.label} className={`tr-cn-feel ${f.friction ? "is-friction" : "is-good"}`}>
              {f.label} <b>{f.n}</b>
            </span>
          ))
        )}
      </p>
      <div className="tr-cn-compose">
        <Avatar name={organiserName} initials={initials(organiserName)} size={36} decorative />
        <div className="tr-cn-compose-box">
          <label className="u-sr-only" htmlFor={`tr-cn-${planId}`}>
            What did you change?
          </label>
          <textarea
            id={`tr-cn-${planId}`}
            className="tr-cn-field"
            maxLength={MAX}
            placeholder="What did you change? For example: Thursdays now start with ten minutes of free speaking."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="tr-cn-row">
            <span className="tr-cn-count">
              Say what changed, never who asked · {draft.length} / {MAX}
            </span>
            <button type="button" className="tr-cn-post" onClick={post} disabled={pending || draft.trim() === ""}>
              Post to learners
            </button>
          </div>
          <ActionNote note={note} />
        </div>
      </div>
      {notes.length > 0 && (
        <div className="tr-cn-feed">
          {notes.map((n) => (
            <ChangeCard key={n.id} note={n} who="You" onRemove={() => run(() => actions.remove(planId, n.id), "Removed. Your learners no longer see it.")} />
          ))}
        </div>
      )}
    </section>
  );
}
