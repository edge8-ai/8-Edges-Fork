"use client";

import type { SprintRow } from "@/entities/boards/lib/types";

// The sprint goal on the board (W.51). `sprints.goal` is written every Monday
// in the planning panel and was then read only on the sprint's own page, so by
// Wednesday nobody could see what the week was for without leaving the board.
//
// It appears only when ONE sprint is the filter, because a goal is that
// sprint's and a board showing every sprint has no single answer. A sprint
// with no goal renders nothing at all rather than an empty box: a labelled
// blank says the same thing as silence and takes a line to do it.
export function SprintGoalLine({ sprintFilter, sprints }: { sprintFilter: string; sprints: SprintRow[] }) {
  // "all" and "backlog" are the filter's two non-sprint values.
  const sprint = sprints.find((s) => s.id === sprintFilter);
  const goal = sprint?.goal?.trim();
  if (!sprint || !goal) return null;
  return (
    <p className="admin-board-sprint-goal u-mb-3">
      <span className="admin-board-sprint-goal-label">{sprint.name}</span>
      {goal}
    </p>
  );
}
