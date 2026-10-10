"use client";

import Link from "next/link";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import type { WorkboardData } from "@/entities/boards/lib/workboard";

// The board page's Sprints tab: the sprint list with plan-vs-actual counts,
// each linking into its detail page. Split out of BoardView (WB-01).
export function SprintsTab({
  data,
  boardBase,
  onManage,
}: {
  data: WorkboardData;
  boardBase: string;
  onManage: () => void;
}) {
  return (
    <div className="u-stack u-gap-3">
      {data.sprints.length === 0 && <div className="admin-cell-muted u-sm">No sprints yet. Create one with Manage sprints.</div>}
      {[...data.sprints]
        .sort((a, b) => (a.status === b.status ? a.sort_order - b.sort_order : a.status === "active" ? -1 : 1))
        .map((s) => {
          const inSprint = data.cards.filter((c) => c.sprint_id === s.id);
          const doneCards = inSprint.filter((c) => c.status === "done");
          const totalHT = inSprint.reduce((sum, c) => sum + (c.human_tokens ?? 0), 0);
          const doneHT = doneCards.reduce((sum, c) => sum + (c.human_tokens ?? 0), 0);
          const pct = inSprint.length ? Math.round((doneCards.length / inSprint.length) * 100) : 0;
          return (
            <Link key={s.id} href={`${boardBase}/sprints/${s.id}`} className="admin-card admin-sprint-card u-link-plain">
              <div className="u-row u-wrap">
                <span className="admin-cell-strong">{s.name}</span>
                <Badge tone={s.status === "active" ? "ok" : "neutral"}>{s.status}</Badge>
                {(s.starts_on || s.ends_on) && (
                  <span className="admin-cell-muted u-sm">
                    {s.starts_on ? formatDate(s.starts_on) : "?"} to {s.ends_on ? formatDate(s.ends_on) : "?"}
                  </span>
                )}
                <span className="admin-cell-muted u-ml-auto u-sm">
                  {doneCards.length}/{inSprint.length} cards
                  {totalHT > 0 ? ` · ${doneHT}/${totalHT} HT` : ""}
                </span>
              </div>
              {s.goal && <div className="admin-cell-muted u-sm u-mt-1">{s.goal}</div>}
              <div className="admin-meter admin-meter--thin u-mt-2">
                <div className="admin-meter-fill" style={{ width: `${pct}%` }} /* layout-ok: data-driven progress width */ />
              </div>
            </Link>
          );
        })}
      <div>
        <button className="admin-btn admin-btn--sm" onClick={onManage}>
          Manage sprints
        </button>
      </div>
    </div>
  );
}
