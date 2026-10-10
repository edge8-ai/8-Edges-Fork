"use client";

import { useState } from "react";
import type { CoachProfileDetail } from "@/entities/coaching/lib/data/profile";
import { GOAL_STATUS_LABELS } from "@/entities/coaching/lib/types";
import { addGoal } from "@/entities/coaching/lib/goal-actions";
import { FastGoalForm } from "@/entities/coaching/ui/FastGoalForm";
import { type ActionResult } from "./shared";
import { GoalRow } from "./GoalRow";

export function GoalsCard({
  detail,
  run,
  busy,
}: {
  detail: CoachProfileDetail;
  run: (label: string, fn: () => Promise<ActionResult>, onOk?: () => void) => void;
  busy: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const current = detail.goals.filter((g) => g.status === "active" || g.status === "draft");
  const past = detail.goals.filter((g) => g.status === "achieved" || g.status === "dropped");

  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">
        FAST goals{" "}
        <span className="admin-cell-muted">
          (Frequent · Ambitious · Specific · Transparent: how they&apos;re measured and get promoted, team-visible)
        </span>
      </div>

      {current.length === 0 && <div className="admin-empty">No goals yet. FAST starts with one.</div>}
      {current.map((g) => (
        <GoalRow key={g.id} g={g} detail={detail} run={run} busy={busy} />
      ))}

      {adding ? (
        <FastGoalForm
          edges={detail.edges}
          busy={busy}
          submitLabel="Add goal"
          onSubmit={(input) => {
            run("Goal", () => addGoal(detail.profileId, input), () => setAdding(false));
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <div className="admin-coach-add-row">
          <button className="admin-btn" disabled={busy} onClick={() => setAdding(true)}>
            Add a FAST goal
          </button>
        </div>
      )}

      {past.length > 0 && (
        <details open className="admin-coach-closed">
          <summary>{past.length} past goal{past.length === 1 ? "" : "s"}</summary>
          {past.map((g) => (
            <div key={g.id} className="admin-coach-commitment is-closed">
              <span className="admin-badge">{GOAL_STATUS_LABELS[g.status]}</span>
              <span>{g.title}</span>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
