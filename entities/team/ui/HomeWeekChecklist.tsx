"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { HomeWeek } from "@/entities/team/lib/home-onboarding";
import type { Result } from "@/kernel/data/result";

// This week's items from the new hire's plan, ticked by the hire themselves.
// The rows are the plan's own checklist (seeded from its week sections when
// the plan is uploaded), so ticking here is ticking the plan. Optimistic: the
// box flips at once and rolls back if the action refuses.

export function HomeWeekChecklist({
  week,
  planHref,
  onToggle,
}: {
  week: HomeWeek;
  planHref: string | null;
  onToggle: (taskId: string, done: boolean) => Promise<Result>;
}) {
  const [tasks, setTasks] = useState(week.tasks);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const done = tasks.filter((t) => t.done).length;

  function toggle(id: string, next: boolean) {
    setError(null);
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done: next } : t)));
    startTransition(async () => {
      const res = await onToggle(id, next);
      if (!res.ok) {
        setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done: !next } : t)));
        setError(res.error);
      }
    });
  }

  return (
    <div className="admin-card admin-section-card u-mb-4">
      <div className="admin-card-head">
        <h3 className="admin-card-title">This week from your plan · {week.label}</h3>
        <span className="admin-cell-muted u-sm">
          {done} of {tasks.length} done
        </span>
      </div>
      <ul className="u-stack u-m-0 u-p-0 u-list-plain admin-team-week">
        {tasks.map((t) => (
          <li key={t.id}>
            <label className="u-row-top u-pointer">
              <input
                type="checkbox"
                checked={t.done}
                disabled={pending}
                onChange={(e) => toggle(t.id, e.target.checked)}
                className="u-mt-1"
              />
              <span className={t.done ? "admin-team-week-done" : undefined}>{t.title}</span>
            </label>
          </li>
        ))}
      </ul>
      {error && <p className="admin-alert admin-alert--err u-mt-2">{error}</p>}
      {(week.remaining || planHref) && (
        <div className="admin-cell-muted u-sm u-mt-3">
          {week.remaining}
          {week.remaining && planHref ? " · " : ""}
          {planHref && <Link href={planHref}>The whole plan →</Link>}
        </div>
      )}
    </div>
  );
}
