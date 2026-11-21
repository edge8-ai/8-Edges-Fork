"use client";

import { useState } from "react";
import type { CoachProfileDetail } from "@/entities/coaching/lib/data/profile";
import type { CoachingGoal } from "@/entities/coaching/lib/types";
import { GOAL_STATUS_LABELS } from "@/entities/coaching/lib/types";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { ladderValue } from "@/entities/coaching/lib/ladder";
import { deleteGoal, updateGoal } from "@/entities/coaching/lib/goal-actions";
import { GoalComments } from "@/entities/coaching/ui/GoalComments";
import { FastGoalForm } from "@/entities/coaching/ui/FastGoalForm";
import { type ActionResult } from "./shared";
import { LadderBadge } from "./LadderBadge";

// The coach's view of one goal. The inline status dropdown and ladder picker
// are gone (K.13): they wrote two of a goal's nine fields, hardcoded the
// quarter to 2026-Q3, and let the coach's copy of a goal drift from the
// member's. Editing now opens the same FastGoalForm everywhere.
export function GoalRow({
  g,
  detail,
  run,
  busy,
}: {
  g: CoachingGoal;
  detail: CoachProfileDetail;
  run: (label: string, fn: () => Promise<ActionResult>, onOk?: () => void) => void;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="admin-coach-commitment">
        <FastGoalForm
          edges={detail.edges}
          busy={busy}
          submitLabel="Save goal"
          initial={{
            title: g.title,
            status: g.status,
            ladderValue: ladderValue(g.ladder),
            descriptionMarkdown: g.descriptionMarkdown,
            stretchMarkdown: g.stretchMarkdown,
            metricUnit: g.metricUnit,
            startValue: g.startValue,
            currentValue: g.currentValue,
            targetValue: g.targetValue,
            dueDate: g.dueDate,
          }}
          onSubmit={(input) => {
            run("Goal", () => updateGoal(detail.profileId, g.id, input), () => setEditing(false));
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="admin-coach-commitment">
      <div className="admin-coach-commitment-main">
        <span className={`admin-badge ${g.status === "active" ? "admin-badge--ok" : "admin-badge--warn"}`}>
          {GOAL_STATUS_LABELS[g.status]}
        </span>
        <span className="admin-coach-commitment-title">{g.title}</span>
        <LadderBadge ladder={g.ladder} />
      </div>
      <div className="admin-coach-commitment-controls">
        <button className="admin-btn admin-btn--sm" disabled={busy} onClick={() => setEditing(true)}>
          Edit
        </button>
        <ConfirmButton
          label="Delete"
          className="admin-btn admin-btn--sm admin-btn--danger"
          title="Delete this FAST goal?"
          body="Its comments go with it, and the goal's owner is notified."
          confirmLabel="Delete"
          disabled={busy}
          onConfirm={() => deleteGoal(detail.profileId, g.id)}
        />
      </div>
      <GoalComments goalId={g.id} comments={g.comments} />
    </div>
  );
}
