"use client";

import { useState, type ReactNode } from "react";
import { groupByPerson, groupMine, type CommitmentRow } from "@/entities/coaching/lib/commitment-groups";
import { CommitmentRowList, type CommitmentBoardOption } from "./CommitmentRowList";
import type { MayProp } from "@/kernel/identity/may-prop";

// The Commitments tab (L.18.3): every promise in one list, in two parts.
// Mine: what I promised my coach, what my coach promised me, and Closed,
// folded. Then, only for a coach, what I promised the people I coach, grouped
// by person. The Today board stays; this is the same promises as a list, with
// the three outcomes one tap away.

export function MyCommitmentList({
  mine,
  asCoach,
  boards,
  coachName,
  may,
}: {
  may: MayProp;
  mine: CommitmentRow[];
  asCoach: CommitmentRow[];
  boards: CommitmentBoardOption[];
  coachName: string | null;
}) {
  const groups = groupMine(mine);
  const people = groupByPerson(asCoach);
  const hasCoach = Boolean(coachName);

  return (
    <div className="admin-commit-tab">
        {(hasCoach || mine.length > 0) && (
          <>
            <CommitmentSection id="commit-mine" title={`What I promised ${coachName ?? "my coach"}`} count={groups.mine.length}>
              <CommitmentRowList may={may} rows={groups.mine} boards={boards} empty="Nothing open. A promise from your next 1-1 lands here." />
            </CommitmentSection>
            <CommitmentSection
              id="commit-theirs"
              title={`What ${coachName ?? "my coach"} promised me`}
              count={groups.theirs.length}
              hint="Theirs to keep, so these have no buttons."
            >
              <CommitmentRowList may={may} rows={groups.theirs} empty="Nothing open." />
            </CommitmentSection>
            <ClosedCommitments title="Closed" rows={groups.closed} may={may} />
          </>
        )}

        {people.length > 0 && (
          <CommitmentSection id="commit-coach" title="What I promised the people I coach" count={people.reduce((n, p) => n + p.open.length, 0)}>
            {people.map((p) => (
              <div key={p.profileId} className="admin-myweek-section">
                <h3 className="admin-myweek-hint">
                  {p.personName} · {p.open.length} open
                </h3>
                <CommitmentRowList may={may} rows={p.open} boards={boards} empty="Nothing open." />
                <ClosedCommitments title={`Closed with ${p.personName}`} rows={p.closed} may={may} />
              </div>
            ))}
          </CommitmentSection>
        )}

        {!hasCoach && mine.length === 0 && people.length === 0 && (
          <p className="admin-myweek-empty">No commitments yet. They come out of 1-1s, yours and the ones you run.</p>
        )}
    </div>
  );
}

export function CommitmentSection({ id, title, count, hint, children }: { id: string; title: string; count: number; hint?: string; children: ReactNode }) {
  return (
    <section className="admin-myweek-section" id={id} aria-labelledby={`${id}-h`}>
      <h2 className="admin-myweek-h" id={`${id}-h`}>
        {title}
        {count > 0 && <span className="admin-myweek-count">{count}</span>}
      </h2>
      {hint && <p className="admin-myweek-hint">{hint}</p>}
      {children}
    </section>
  );
}

// Closed rows, newest first, folded: they are the record, not the work.
export function ClosedCommitments({ title, rows, may }: { title: string; rows: CommitmentRow[]; may: MayProp }) {
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;
  return (
    <details className="admin-myweek-section" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="admin-myweek-hint">
        {title} · {rows.length}
      </summary>
      {open && <CommitmentRowList may={may} rows={rows} />}
    </details>
  );
}
