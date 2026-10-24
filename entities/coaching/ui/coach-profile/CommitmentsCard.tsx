"use client";

import { useState } from "react";
import type { CoachProfileDetail } from "@/entities/coaching/lib/data/profile";
import { addCommitment, updateCommitmentStatus } from "@/entities/coaching/lib/commitment-actions";
import { promiseGroups } from "@/entities/coaching/lib/promise-groups";
import { formatDate } from "@/kernel/ui/format";
import { type ActionResult } from "./shared";

// What was promised, as a coach reads it before a session (K.80): the
// employee's promises by where they stand — stuck first, because that is the
// first thing to ask about — then what they kept since last time, which is
// what to recognise. The coach's own promises follow as a short list they tick
// off. The employee's promises are theirs to move, on their own page; this
// card reads them (self-reported, Khoa's rule).
export function CommitmentsCard({
  detail,
  lastHeldOn,
  run,
  busy,
}: {
  detail: CoachProfileDetail;
  lastHeldOn: string | null;
  run: (label: string, fn: () => Promise<ActionResult>, onOk?: () => void) => void;
  busy: boolean;
}) {
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState<"member" | "coach">("member");
  const g = promiseGroups(detail.commitments, lastHeldOn);
  const name = detail.member.name;
  const nothing = g.stuck.length + g.onIt.length + g.kept.length + g.mine.length === 0;

  return (
    <section className="admin-card coach-card">
      <h2 className="coach-card-title">Promises</h2>
      {nothing && <p className="coach-card-empty">Nothing promised yet. Agree one or two next steps in the session.</p>}

      {g.stuck.length > 0 && (
        <div className="coach-promise-group">
          <h3 className="coach-promise-head coach-promise-head--stuck">Stuck · ask what is in the way</h3>
          <ul className="coach-promise-list">
            {g.stuck.map((c) => (
              <li key={c.id} className="coach-promise coach-promise--stuck">
                <span className="coach-promise-title">{c.title}</span>
                {c.statusNote && <span className="coach-promise-note">“{c.statusNote}”</span>}
                {c.statusUpdatedAt && (
                  <span className="coach-promise-meta">since {formatDate(c.statusUpdatedAt.slice(0, 10))}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {g.onIt.length > 0 && (
        <div className="coach-promise-group">
          <h3 className="coach-promise-head">{name} is on it</h3>
          <ul className="coach-promise-list">
            {g.onIt.map((c) => (
              <li key={c.id} className="coach-promise">
                <span className="coach-promise-title">{c.title}</span>
                {c.dueOn && <span className="coach-promise-meta">by {formatDate(c.dueOn)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {g.kept.length > 0 && (
        <div className="coach-promise-group">
          <h3 className="coach-promise-head coach-promise-head--kept">Kept since last time · say so</h3>
          <ul className="coach-promise-list">
            {g.kept.map((c) => (
              <li key={c.id} className="coach-promise coach-promise--kept">
                <span className="coach-promise-title">{c.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {g.mine.length > 0 && (
        <div className="coach-promise-group">
          <h3 className="coach-promise-head">Your promises to {name}</h3>
          <ul className="coach-promise-list">
            {g.mine.map((c) => (
              <li key={c.id} className="coach-promise">
                <span className="coach-promise-title">{c.title}</span>
                <button
                  type="button"
                  className="admin-btn admin-btn--sm"
                  disabled={busy}
                  onClick={() => run("Promise", () => updateCommitmentStatus(c.id, "completed", c.statusNote ?? ""))}
                >
                  Done
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}


      <form
        className="coach-promise-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          // Cleared only once it saved, so a refused add keeps what was typed.
          run("Promise", () => addCommitment(detail.profileId, title, owner, null), () => setTitle(""));
        }}
      >
        <input
          className="admin-input"
          aria-label="A new promise"
          placeholder="Add a next step…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select
          className="admin-input"
          aria-label="Whose promise"
          value={owner}
          onChange={(e) => setOwner(e.target.value as "member" | "coach")}
        >
          <option value="member">{name}&apos;s</option>
          <option value="coach">Mine</option>
        </select>
        <button type="submit" className="admin-btn" disabled={busy || !title.trim()}>
          Add
        </button>
      </form>
    </section>
  );
}
