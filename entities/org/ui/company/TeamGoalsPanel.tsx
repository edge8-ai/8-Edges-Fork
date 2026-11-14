"use client";

import { useState } from "react";
import Link from "next/link";
import { MultiSelect } from "@/kernel/ui/MultiSelect";

// The "Team member goals" tab of the Company Goals view, with two ways to read
// the same active FAST goals:
//   By team member      — one card per person, their goals under them (default).
//   By company objective — one section per company objective, the members whose
//                          goals ladder to it, so the alignment is visible.
// Both groupings are built server-side (lib/company/goals) and passed in; this
// only toggles which is shown. `personHrefBase` lets each shell (team directory vs
// admin talent) point the name links at its own person page.

export type FastGoal = { title: string; ladder: string | null };
export type PersonGroup = { teamMemberId: string; name: string; departmentId: string | null; goals: FastGoal[] };
export type ObjectiveItem = {
  teamMemberId: string;
  name: string;
  departmentId: string | null;
  goalTitle: string;
  ladder: string | null;
};
export type ObjectiveGroup = {
  // null is the trailing "not yet aligned" bucket.
  objectiveId: string | null;
  label: string;
  lineTag: string; // brand for the chip colour, or "company"
  lineLabel: string;
  items: ObjectiveItem[];
};

type View = "person" | "objective";

export function TeamGoalsPanel({
  byPerson,
  byObjective,
  withGoal,
  personHrefBase,
  departments = [],
}: {
  byPerson: PersonGroup[];
  byObjective: ObjectiveGroup[];
  withGoal: number;
  // A path prefix, not a function: this is a client component, so props must
  // be serializable across the server boundary.
  personHrefBase: string;
  // The roster's departments, for the multi-select filter (Dave, 2026-09-07).
  departments?: { id: string; name: string }[];
}) {
  const [view, setView] = useState<View>("person");
  const [dept, setDept] = useState<string[]>([]);
  const inDept = (id: string | null) => dept.length === 0 || dept.includes(id ?? "none");
  const people = byPerson.filter((p) => inDept(p.departmentId));
  const objectives = byObjective.map((o) => ({ ...o, items: o.items.filter((it) => inDept(it.departmentId)) }));
  const hasNoDept = byPerson.some((p) => p.departmentId === null);

  return (
    <section className="admin-card admin-section-card u-mb-4">
      <div className="admin-cg-panel-head">
        <div className="admin-card-title">
          Team member FAST goals{" "}
          <span className="admin-cell-muted">
            ({withGoal}/{byPerson.length} set · transparent to the whole team)
          </span>
        </div>
        {departments.length > 0 && (
          <MultiSelect
            label="Filter by department"
            noun="departments"
            options={[...departments.map((d) => ({ value: d.id, label: d.name })), ...(hasNoDept ? [{ value: "none", label: "No department" }] : [])]}
            value={dept}
            onChange={setDept}
          />
        )}
        <div className="admin-viewtoggle" role="group" aria-label="Group goals by">
          <button
            type="button"
            className={view === "person" ? "is-active" : ""}
            aria-pressed={view === "person"}
            onClick={() => setView("person")}
          >
            By team member
          </button>
          <button
            type="button"
            className={view === "objective" ? "is-active" : ""}
            aria-pressed={view === "objective"}
            onClick={() => setView("objective")}
          >
            By company objective
          </button>
        </div>
      </div>

      {view === "person" ? (
        <div className="admin-edges-fast-grid">
          {people.length === 0 && <div className="admin-cell-muted">No one in that department.</div>}
          {people.map((p) => (
            <div key={p.teamMemberId} className="admin-edges-fast-person">
              <div className="admin-edges-fast-name">
                <Link href={`${personHrefBase}/${p.teamMemberId}`}>{p.name}</Link>
              </div>
              {p.goals.length === 0 && <div className="admin-cell-muted">No active goal</div>}
              {p.goals.map((g, i) => (
                <div key={i} className="admin-edges-fast-goal">
                  <div>{g.title}</div>
                  <div className="admin-cell-muted">{g.ladder ? `⇗ ${g.ladder}` : "No ladder yet"}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="admin-cg-obj-list">
          {objectives.map((o) => (
            <div key={o.objectiveId ?? "unaligned"} className="admin-cg-obj-group">
              <div className="admin-cg-obj-head">
                {o.objectiveId !== null && (
                  <span className={`admin-edges-ltag admin-edges-ltag--${o.lineTag}`}>{o.lineLabel}</span>
                )}
                <h4>{o.label}</h4>
                <span className="admin-cell-muted">
                  {o.items.length} {o.items.length === 1 ? "goal" : "goals"}
                </span>
              </div>
              {o.items.length === 0 ? (
                <div className="admin-cell-muted admin-cg-obj-empty">No FAST goals aligned here yet.</div>
              ) : (
                o.items.map((it, i) => (
                  <div key={i} className="admin-cg-obj-row">
                    <Link href={`${personHrefBase}/${it.teamMemberId}`} className="admin-cg-obj-person">
                      {it.name}
                    </Link>
                    <span className="admin-cg-obj-goal">{it.goalTitle}</span>
                    {it.ladder && <span className="admin-cell-muted admin-cg-obj-ladder">⇗ {it.ladder}</span>}
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
