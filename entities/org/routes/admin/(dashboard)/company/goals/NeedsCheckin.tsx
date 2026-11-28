"use client";

import { krCode } from "@/entities/org/lib/company/edges-shared";
import type { ObjectiveWithKrs } from "@/entities/org/lib/company/goal-shapes";
import { Badge } from "@/kernel/ui/Badge";

// What needs the reader leads the Goals page: every key result at risk or off
// track, off track first. Check in scrolls to that key result's row in the
// objective list below and clicks it, which opens the one check-in form the
// editor owns, so there are not two forms with two sets of state.
function openCheckin(krId: string) {
  const row = document.getElementById(`kr-${krId}`);
  row?.scrollIntoView({ behavior: "smooth", block: "center" });
  row?.click();
}

export function NeedsCheckin({ tree }: { tree: ObjectiveWithKrs[] }) {
  const needs = tree
    .flatMap((o, oi) => o.krs.map((kr, ki) => ({ kr, code: krCode(oi, ki), objective: o.title })))
    .filter(({ kr }) => kr.status === "off_track" || kr.status === "at_risk")
    .sort((a, b) => (a.kr.status === b.kr.status ? 0 : a.kr.status === "off_track" ? -1 : 1));
  if (needs.length === 0) return null;
  return (
    <section className="admin-card admin-section-card u-mb-4" aria-labelledby="goals-needs-h">
      <div className="ats-sec-head">
        <div>
          <p className="ats-sec-k">Needs a check-in</p>
          <h2 className="ats-sec-h" id="goals-needs-h">
            {needs.length === 1 ? "One key result is" : `${needs.length} key results are`} at risk or off track
          </h2>
        </div>
      </div>
      {needs.map(({ kr, code, objective }) => (
        <div key={kr.id} className="ats-row co-row">
          <span className="u-min-0">
            <span className="ats-person-name">
              {code} {kr.title}
            </span>
            <span className="ats-person-meta">{objective}</span>
          </span>
          <Badge tone={kr.status === "off_track" ? "err" : "warn"}>{kr.status === "off_track" ? "Off track" : "At risk"}</Badge>
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => openCheckin(kr.id)}>
            Check in
          </button>
        </div>
      ))}
    </section>
  );
}
