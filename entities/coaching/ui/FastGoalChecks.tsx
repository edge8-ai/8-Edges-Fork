"use client";

import { fastChecks, GOAL_EXAMPLES, type FastCheckInput } from "@/entities/coaching/lib/fast-checks";

// The four letters beside the form, lit as the goal earns them, and the
// weak-versus-good examples the sentence builder hides behind a toggle. Split
// out of FastGoalForm so that file stays under its size cap and so the checks
// render from the pure fastChecks() result rather than from form state.

export function FastGoalChecks({ input }: { input: FastCheckInput }) {
  return (
    <aside className="admin-fast-checks" aria-label="FAST checks">
      {fastChecks(input).map((c) => (
        <div
          key={c.key}
          className={`admin-fast-check${c.lit ? " is-lit" : ""}`}
          // The green border is the only signal a sighted reader gets; say it
          // in words for everyone else.
          aria-label={`${c.label}: ${c.lit ? "earned" : "not yet earned"}`}
        >
          <span className="admin-fast-check-letter" aria-hidden="true">
            {c.key}
          </span>
          <span className="admin-fast-check-body">
            <span className="u-row u-gap-1 u-wrap">
              <strong>{c.label}</strong>
              {/* Colour and a border were the only signal a check was earned,
                  which a colour-blind reader cannot see; the word says it too. */}
              <span className="admin-badge coach-check-text">{c.lit ? "lit" : "dark"}</span>
            </span>
            <span className="admin-cell-muted">{c.note}</span>
          </span>
        </div>
      ))}
    </aside>
  );
}

export function GoalExamples() {
  return (
    <ul className="admin-fast-examples">
      {GOAL_EXAMPLES.map((e) => (
        <li key={e.weak}>
          <del>{e.weak}</del>
          <span className="admin-fast-example-good">{e.good}</span>
        </li>
      ))}
    </ul>
  );
}
