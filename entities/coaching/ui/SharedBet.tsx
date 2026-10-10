"use client";

import type { SharedGoal } from "@/entities/coaching/client";

// "Also climbing this one" (L.5): the other people whose goals lift the same
// company key result, shown on the rung they share.
//
// It is the cooperative answer to what a leaderboard is clumsily trying to do.
// A key result several people are pushing towards is the most natural place in
// the whole product to put a ranking, and putting company here instead is the
// point: you are not the only one on this, and that is all it says.
//
// What keeps it that way is upstream, in SharedGoal, which carries a name and
// a goal title and no number at all — so there is nothing here to sort by and
// nothing to draw a bar from. Read that type before adding a prop.

export function SharedBet({ goals }: { goals: SharedGoal[] }) {
  // Nothing to say rather than an empty frame: a key result only this person is
  // lifting is an ordinary situation, not a gap in the page.
  if (goals.length === 0) return null;
  return (
    <div className="coach-shared-bet">
      <p className="admin-eyebrow coach-shared-bet-lead">Also climbing this one</p>
      <ul className="coach-shared-bet-list">
        {goals.map((g) => (
          <li key={`${g.name}-${g.goalTitle}`}>
            <span className="coach-shared-bet-face" aria-hidden="true">
              {g.name.slice(0, 1)}
            </span>
            <span className="coach-shared-bet-who">{g.name}</span>
            <span className="coach-shared-bet-goal">{g.goalTitle}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
