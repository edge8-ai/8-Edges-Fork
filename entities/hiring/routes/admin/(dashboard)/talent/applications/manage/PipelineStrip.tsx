"use client";

import { useEffect, useState } from "react";
import { timeAgo } from "@/kernel/ui/format";
import { type StageOption } from "../actions";

export function PipelineStrip({
  stages,
  loading,
  stageId,
  stageEnteredAt,
  appliedAt,
  onMove,
}: {
  stages: StageOption[];
  loading: boolean;
  stageId: string;
  stageEnteredAt: string | null;
  appliedAt: string | null;
  onMove: (s: StageOption) => void;
}) {
  // Age is time-relative, so compute it after mount to avoid a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (loading) {
    return (
      <div className="admin-record-pipe">
        <span className="admin-cell-muted">Loading stages…</span>
      </div>
    );
  }
  if (!stages.length) return null;

  // Terminal stages (Hired / Rejected) are parallel outcomes, not sequential
  // steps. Show only the current terminal one, so a rejected candidate doesn't
  // render "Hired" as a completed step sitting before "Rejected".
  const shown = stages.filter((s) => !s.isTerminal || s.id === stageId);
  const currentIdx = shown.findIndex((s) => s.id === stageId);

  function ageLabel(): string | null {
    if (!mounted) return null;
    if (stageEnteredAt) {
      const days = Math.max(0, Math.floor((Date.now() - new Date(stageEnteredAt).getTime()) / 86400000));
      return days === 0 ? "today" : `${days}d in stage`;
    }
    if (appliedAt) return `applied ${timeAgo(appliedAt)}`;
    return null;
  }

  return (
    <div className="admin-record-pipe" role="list" aria-label="Hiring stages">
      {shown.map((s, i) => {
        const state = i < currentIdx ? "done" : i === currentIdx ? "now" : "todo";
        const age = state === "now" ? ageLabel() : null;
        return (
          <div key={s.id} className={`admin-record-step admin-record-step--${state}`} role="listitem">
            <button
              type="button"
              className="admin-record-step-hit"
              onClick={() => onMove(s)}
              title={`Move to ${s.name}`}
            >
              <span className="admin-record-step-node">{state === "done" ? "✓" : i + 1}</span>
              <span className="admin-record-step-label">
                {s.name}
                {s.isTerminal ? " (final)" : ""}
                {age && <span className="admin-record-step-sub">{age}</span>}
              </span>
            </button>
            {i < shown.length - 1 && <span className="admin-record-step-bar" />}
          </div>
        );
      })}
    </div>
  );
}
