"use client";

import type { CoachProfileDetail } from "@/entities/coaching/lib/data/profile";

export function CompanyGoalsCard({ detail }: { detail: CoachProfileDetail }) {
  const ladderedIds = new Set(
    [...detail.goals, ...detail.priorities]
      .map((g) => (g.ladder?.kind === "key_result" || g.ladder?.kind === "objective" ? g.ladder.id : null))
      .filter(Boolean) as string[],
  );

  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">Company goals</div>
      <div className="admin-hint">
        The 8 Edges tree their goals ladder into. Highlighted rows are where {detail.member.name} plugs in.
      </div>
      <div className="admin-coach-okr-tree">
        {/* This year's company goals only, numbered as Company Goals numbers
            them; the loader keeps older objectives for resolving labels. */}
        {detail.edges.objectives.filter((o) => o.code).map((o) => (
          <div key={o.id} className="admin-coach-okr-objective">
            <div className={`admin-coach-okr-line${ladderedIds.has(o.id) ? " is-laddered" : ""}`}>
              <strong>{o.code}</strong> {o.label}
            </div>
            <ul>
              {detail.edges.keyResults
                .filter((k) => k.objectiveId === o.id && k.code)
                .map((k) => (
                  <li key={k.id} className={`admin-coach-okr-line${ladderedIds.has(k.id) ? " is-laddered" : ""}`}>
                    <span className="admin-cell-muted">{k.code}</span> {k.label}
                    {ladderedIds.has(k.id) && <span className="admin-badge admin-badge--ok">their ladder</span>}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
