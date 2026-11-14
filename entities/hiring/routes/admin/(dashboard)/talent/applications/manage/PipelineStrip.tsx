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

  if (loading) return <p className="ats-sub">Loading stages…</p>;
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
      return days === 0 ? "Here since today" : `Here for ${days} day${days === 1 ? "" : "s"}`;
    }
    if (appliedAt) return `Applied ${timeAgo(appliedAt)}`;
    return null;
  }

  return (
    <div className="ats-steps" role="list" aria-label="Hiring stages">
      {shown.map((s, i) => {
        const state = i < currentIdx ? "done" : i === currentIdx ? "now" : "todo";
        const sub = state === "now" ? ageLabel() : state === "done" ? "Done" : i === currentIdx + 1 ? "Next" : null;
        return (
          <div key={s.id} role="listitem">
            <button
              type="button"
              className={`ats-step is-${state}`}
              aria-current={state === "now" ? "step" : undefined}
              onClick={() => onMove(s)}
              title={`Move to ${s.name}`}
            >
              <b>
                {i + 1} · {s.name}
                {s.isTerminal ? " (final)" : ""}
              </b>
              {/* A non-breaking space keeps every step the same height. */}
              <span>{sub ?? "\u00a0"}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
