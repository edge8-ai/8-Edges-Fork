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

  // The rows are a route of numbered stops on the postcard profile (OV.5); the
  // look lives in app/styles/team-profile.css, the only page that renders this.
  return (
    <div>
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      {goals.length === 0 && <div className="admin-cell-muted">No active FAST goal yet.</div>}
      <ol className="tp-goal-list">
        {goals.map((g, i) => (
          <li key={g.goalId} className={open === g.goalId ? "tp-goal tp-goal--editing" : "tp-goal"}>
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
                <span className={`tp-num tp-num-${i % 5}`} aria-hidden="true">{i + 1}</span>
                <div className="tp-goal-body">
                  <p className="tp-goal-t">{g.title}</p>
                  {g.ladderLabel && (
                    <p className="tp-ladder">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M7 17 17 7 M8 7h9v9" />
                      </svg>
                      <span>Ladders to {g.ladderLabel}</span>
                    </p>
                  )}
                </div>
                {canManage && (
                  <span className="tp-goal-acts">
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
      </ol>
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
