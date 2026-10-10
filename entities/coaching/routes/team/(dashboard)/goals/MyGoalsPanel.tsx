"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EdgesOptions } from "@/entities/coaching/lib/types";
import { FastGoalCard } from "@/entities/coaching/ui/FastGoalCard";
import { FastGoalForm } from "@/entities/coaching/ui/FastGoalForm";
import type { MyGoalRow } from "@/entities/coaching/lib/my-goal-row";
import { addMyGoal, deleteMyGoal, updateMyGoal } from "./actions";

// The My FAST Goals tab (K.62). The panel owns the tab's one filled action —
// "Add a goal" — and the add/edit form; each goal itself is a FastGoalCard,
// which is the same object the Today ladder draws as the goal rung.
//
// It stays under routes/ because the three server actions live here and ui/
// may not import them (CLAUDE.md rule 4); the card takes the delete action as
// a prop for the same reason. /team/goals is a redirect onto this tab since
// K.18, so there is exactly one goals screen and this is it.

export function MyGoalsPanel({
  rows,
  edges,
  coachName,
  todayISO,
}: {
  rows: MyGoalRow[];
  edges: EdgesOptions;
  coachName: string | null;
  todayISO: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  // null = nothing open; "new" = the add form; a goal id = that card's editor.
  const [open, setOpen] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string) {
    setBanner(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setBanner({ tone: "ok", text: okText });
        setOpen(null);
        router.refresh();
      } else {
        setBanner({ tone: "err", text: res.error });
      }
    });
  }

  const initialOf = (g: MyGoalRow) => ({
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
  });

  return (
    <div className="coach-goals-panel">
      {banner && (
        <div className={`admin-alert admin-alert--${banner.tone === "ok" ? "ok" : "err"}`}>
          {banner.text}
        </div>
      )}

      {open === "new" ? (
        <div className="admin-card admin-section-card u-mb-5">
          <h2 className="admin-card-title">Add a FAST goal</h2>
          <FastGoalForm
            edges={edges}
            busy={pending}
            submitLabel="Add goal"
            onSubmit={(input) => run(() => addMyGoal(input), "Goal added. Your manager has been notified.")}
            onCancel={() => setOpen(null)}
          />
        </div>
      ) : (
        // The tab's one filled mint pill. Every card's "Update my number" is
        // drawn as a line pill against it, so at any moment the page has a
        // single most-important action (ui-ux-pro-max priority 8, one primary
        // action per view).
        <div className="admin-form-actions u-mb-5">
          <button
            type="button"
            className="coach-pill coach-goals-add"
            onClick={() => setOpen("new")}
            disabled={pending}
          >
            Add a goal
          </button>
        </div>
      )}

      {rows.length === 0 && open !== "new" && (
        <div className="admin-empty">
          No goals yet. Add one, and it lands with your manager and in your next 1-1.
        </div>
      )}

      {rows.map((g) =>
        open === g.id ? (
          <div key={g.id} className="admin-card admin-section-card u-mb-5">
            <h2 className="admin-card-title">Edit goal</h2>
            <FastGoalForm
              edges={edges}
              busy={pending}
              submitLabel="Save goal"
              initial={initialOf(g)}
              onSubmit={(input) =>
                run(() => updateMyGoal(g.id, input), "Goal updated. Your manager has been notified.")
              }
              onCancel={() => setOpen(null)}
            />
          </div>
        ) : (
          <FastGoalCard
            key={g.id}
            goal={g}
            coachName={coachName}
            todayISO={todayISO}
            busy={pending}
            onEdit={() => setOpen(g.id)}
            onDelete={() => deleteMyGoal(g.id)}
            onDeleted={() => {
              setBanner({ tone: "ok", text: "Goal deleted. Your manager has been notified." });
              router.refresh();
            }}
          />
        ),
      )}
    </div>
  );
}
