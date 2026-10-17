"use client";

import { useState, useTransition } from "react";
import type { TeamMemberGoal } from "@/entities/coaching/lib/data/member-goals";
import type { EdgesOptions } from "@/entities/coaching/lib/types";
import { addGoal, deleteGoal, updateGoal } from "@/entities/coaching/lib/goal-actions";
import { GoalComments } from "@/entities/coaching/ui/GoalComments";
import { FastGoalForm } from "@/entities/coaching/ui/FastGoalForm";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";

// FAST goals on a directory profile. Everyone sees them (and can comment);
// managers get Add / Edit / Delete for any team member, through the same
// FastGoalForm the member's own page and the coach's card render. Until K.13
// this was a title-only box that forced the ladder to none, so a goal a manager
// created here could not be saved by its owner until they picked a ladder.
export function TeamGoalsEditor({
  profileId,
  goals,
  edges,
  canManage,
}: {
  profileId: string;
  goals: TeamMemberGoal[];
  edges: EdgesOptions;
  canManage: boolean;
}) {
  // null = nothing open; "new" = the add form; a goal id = that row's editor.
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) setOpen(null);
      else setError(res.error);
    });
  };

  return (
    <div>
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      {goals.length === 0 && <div className="admin-cell-muted">No active FAST goal yet.</div>}
      <ul className="admin-mycoach-priorities">
        {goals.map((g) => (
          <li key={g.goalId}>
            {open === g.goalId ? (
              <FastGoalForm
                edges={edges}
                busy={busy}
                submitLabel="Save goal"
                initial={{
                  title: g.title,
                  status: g.status,
                  ladderValue: g.ladderValue,
                  descriptionMarkdown: g.descriptionMarkdown,
                  stretchMarkdown: g.stretchMarkdown,
                  metricUnit: g.metricUnit,
                  startValue: g.startValue,
                  currentValue: g.currentValue,
                  targetValue: g.targetValue,
                  dueDate: g.dueDate,
                }}
                onSubmit={(input) => run(() => updateGoal(profileId, g.goalId, input))}
                onCancel={() => setOpen(null)}
              />
            ) : (
              <>
                <strong>{g.title}</strong>
                {g.ladderLabel && <span className="admin-cell-muted"> · ladders to {g.ladderLabel}</span>}
                {canManage && (
                  <span className="admin-goal-manage-btns">
                    <button className="admin-btn admin-btn--sm" onClick={() => setOpen(g.goalId)}>
                      Edit
                    </button>
                    <ConfirmButton
                      label="Delete"
                      className="admin-btn admin-btn--sm admin-btn--danger"
                      title="Delete this FAST goal?"
                      body="Its comments go with it, and the goal's owner is notified."
                      confirmLabel="Delete"
                      disabled={busy}
                      onConfirm={() => deleteGoal(profileId, g.goalId)}
                    />
                  </span>
                )}
              </>
            )}
            <GoalComments goalId={g.goalId} comments={g.comments} />
          </li>
        ))}
      </ul>
      {canManage &&
        (open === "new" ? (
          <FastGoalForm
            edges={edges}
            busy={busy}
            submitLabel="Add goal"
            onSubmit={(input) => run(() => addGoal(profileId, input))}
            onCancel={() => setOpen(null)}
          />
        ) : (
          <div className="admin-coach-add-row">
            <button className="admin-btn" disabled={busy} onClick={() => setOpen("new")}>
              Add a FAST goal
            </button>
          </div>
        ))}
    </div>
  );
}
