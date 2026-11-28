import type { CSSProperties } from "react";
import { BRAND_LABELS, agentInitials, krCode, objectiveCode, personInitials, type KrRow } from "@/entities/org/lib/company/edges-shared";
import {
  KR_TONE_LABEL,
  krProgress,
  objectiveRollup,
  type KrProgress,
  type ObjectiveRollup,
} from "@/entities/org/lib/company/kr-progress";
import type { LadderedPerson, ObjectiveWithKrs } from "@/entities/org/lib/company/goal-shapes";

// The "Company goals" tab (G.14). The read-only team view lives here, with the
// pieces the admin editor (CompanyGoalsEditor) shares: the bar, the objective
// head, a key result's cells and the ladder stack. Both read a key result
// through krProgress, so a number nobody has measured says so on both pages
// and stays out of its objective's percent.

const OBJECTIVE_TONE_LABEL = { on: "On track", risk: "At risk", off: "Off track" } as const;

// One bar: the fill is the key result's percent, the tick is where the year is.
// Both arrive as CSS variables, which is the one inline style in this file.
export function GoalBar({ pct, pace, tone }: { pct: number | null; pace?: number | null; tone: string }) {
  const empty = pct == null;
  return (
    <span
      className={`admin-goals-bar admin-goals-tone--${tone}${empty ? " admin-goals-bar--empty" : ""}`}
      style={{ "--pct": `${empty ? 0 : Math.max(pct, pct > 0 ? 3 : 0)}%`, "--pace": `${pace ?? 0}%` } as CSSProperties} /* layout-ok: data-driven width and pace */
    >
      {!empty && <i className="admin-goals-bar-fill" />}
      {!empty && pace != null && <i className="admin-goals-bar-pace" aria-hidden="true" />}
    </span>
  );
}

function Ring({ pct, tone, size }: { pct: number | null; tone: string; size: "sm" | "lg" }) {
  const box = size === "lg" ? 64 : 48;
  const r = size === "lg" ? 27 : 20;
  const c = 2 * Math.PI * r;
  return (
    <span className={`admin-goals-ring admin-goals-ring--${size} admin-goals-tone--${tone}`}>
      <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} aria-hidden="true">
        <circle className="admin-goals-ring-track" cx={box / 2} cy={box / 2} r={r} />
        {pct != null && pct > 0 && (
          <circle className="admin-goals-ring-arc" cx={box / 2} cy={box / 2} r={r} strokeDasharray={`${((c * pct) / 100).toFixed(1)} ${c.toFixed(1)}`} />
        )}
      </svg>
      <span className="admin-goals-ring-num">{pct == null ? "—" : `${pct}%`}</span>
    </span>
  );
}

export function StatusPill({ tone, label }: { tone: string; label: string }) {
  return (
    <span className={`admin-goals-pill admin-goals-tone--${tone}`}>
      <i aria-hidden="true" />
      {label}
    </span>
  );
}

export function RollupCounts({ rollup }: { rollup: ObjectiveRollup }) {
  return (
    <span className="admin-goals-counts">
      {rollup.counts.map((c) => (
        <span key={c.tone}>
          <b>{c.n}</b> {KR_TONE_LABEL[c.tone].toLowerCase()}
        </span>
      ))}
    </span>
  );
}

function Owners({ kr, initialsById }: { kr: KrRow; initialsById: Record<string, string> }) {
  return (
    <span className="admin-edges-owner">
      <span className="admin-edges-av" title="Accountable human">
        {initialsById[kr.accountable_person_id] ?? "?"}
      </span>
      {kr.executing_agent && (
        <span className="admin-edges-av admin-edges-av--bot" title={`${kr.executing_agent} agent`}>
          {agentInitials(kr.executing_agent)}
        </span>
      )}
    </span>
  );
}

// The rollup line under an objective's title: its percent counts measured key
// results only, so the counts beside it say how many are still unmeasured.
export function AdminObjectiveHead({ objective, index, rollup }: { objective: ObjectiveWithKrs; index: number; rollup: ObjectiveRollup }) {
  return (
    <>
      <div className="admin-goals-ahead">
        <span className={`admin-edges-ltag admin-edges-ltag--${objective.brand ?? "company"}`}>
          {BRAND_LABELS[objective.brand ?? "company"]}
        </span>
        <h3>
          {objectiveCode(index)} · {objective.title}
        </h3>
        <span className="admin-goals-roll">
          <GoalBar pct={rollup.pct} tone={rollup.tone} />
          <b>{rollup.pct == null ? "—" : `${rollup.pct}%`}</b>
        </span>
        <StatusPill tone={rollup.tone} label={OBJECTIVE_TONE_LABEL[rollup.tone]} />
      </div>
      <div className="admin-goals-asub">
        <RollupCounts rollup={rollup} />
      </div>
      <div className="admin-goals-agrid admin-goals-acolh" aria-hidden="true">
        <span>Key result</span>
        <span>Laddered</span>
        <span>Owner</span>
        <span className="admin-goals-right">Value / target</span>
        <span>Progress</span>
        <span className="admin-goals-right">Status</span>
      </div>
    </>
  );
}

// A key result's cells in the admin grid. The row around it (the click target
// that opens the check-in) stays the editor's.
export function AdminKrCells({
  kr,
  code,
  progress,
  pace,
  ladder,
  initialsById,
}: {
  kr: KrRow;
  code: string;
  progress: KrProgress;
  pace: number;
  ladder: LadderedPerson[];
  initialsById: Record<string, string>;
}) {
  return (
    <div className="admin-goals-agrid">
      <div className="admin-edges-kr-title">
        <span className="admin-kr-index">{code}</span>
        {kr.title}
      </div>
      <span>
        <LadderStack people={ladder} />
      </span>
      <Owners kr={kr} initialsById={initialsById} />
      <span className="admin-goals-aval">
        {progress.measured ? (
          <>
            <b>{progress.value}</b> <span>/ {progress.target ?? "no target"}</span>
          </>
        ) : (
          <span>Not measured</span>
        )}
      </span>
      <span className="admin-goals-aprog">
        <GoalBar pct={progress.pct} pace={progress.paced ? pace : null} tone={progress.tone} />
        <b>{progress.pct == null ? "—" : `${progress.pct}%`}</b>
      </span>
      <span className="admin-goals-right">
        <StatusPill tone={progress.tone} label={progress.measured ? KR_TONE_LABEL[progress.tone] : "No data"} />
      </span>
    </div>
  );
}

export function GoalsLegend({ pace }: { pace: number }) {
  return (
    <p className="admin-goals-legend">
      <span>
        <i className="admin-goals-legend-pace" aria-hidden="true" />
        Where the year is today ({pace}%)
      </span>
      <span>An objective&apos;s percent counts measured key results only</span>
    </p>
  );
}

// Members whose FAST goals ladder up to this KR. Photo avatars where we have
// them, initials otherwise; the name is on hover (and for screen readers).
const LADDER_MAX = 5;
export function LadderStack({ people }: { people: LadderedPerson[] }) {
  if (people.length === 0) return null;
  const shown = people.slice(0, LADDER_MAX);
  const extra = people.slice(LADDER_MAX);
  return (
    <span className="admin-edges-ladder" title={people.length > 1 ? `Laddered: ${people.map((p) => p.name).join(", ")}` : undefined}>
      {shown.map((p) =>
        p.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions
          <img key={p.teamMemberId} className="admin-edges-ladder-av" src={p.avatarUrl} alt={p.name} title={p.name} />
        ) : (
          <span key={p.teamMemberId} className="admin-edges-ladder-av admin-edges-ladder-av--txt" title={p.name} aria-label={p.name}>
            {personInitials(p.name)}
          </span>
        ),
      )}
      {extra.length > 0 && (
        <span className="admin-edges-ladder-more" title={extra.map((p) => p.name).join(", ")}>
          +{extra.length}
        </span>
      )}
    </span>
  );
}

// The team view: a ring per objective up top (each jumps to its card), then a
// card per objective with its ring, status and key results.
export function CompanyGoalsObjectives({
  tree,
  initialsById,
  unmeasuredKrIds,
  pacePct,
  emptyLabel,
}: {
  tree: ObjectiveWithKrs[];
  initialsById: Record<string, string>;
  unmeasuredKrIds: string[];
  pacePct: number;
  emptyLabel: string;
}) {
  if (tree.length === 0) return <div className="admin-empty">{emptyLabel}</div>;
  const unmeasured = new Set(unmeasuredKrIds);
  const rows = tree.map((o) => ({ o, rollup: objectiveRollup(o.krs, unmeasured) }));

  return (
    <div className="admin-goals">
      <div className="admin-goals-sum">
        {rows.map(({ o, rollup }, oi) => (
          <a key={o.id} className="admin-goals-sumcard" href={`#objective-${objectiveCode(oi).toLowerCase()}`}>
            <Ring pct={rollup.pct} tone={rollup.tone} size="sm" />
            <span className="admin-goals-sumtxt">
              <span className="admin-goals-eyebrow">
                {objectiveCode(oi)} · {OBJECTIVE_TONE_LABEL[rollup.tone]}
              </span>
              <span className="admin-goals-sumtitle">{o.title}</span>
            </span>
          </a>
        ))}
      </div>

      <GoalsLegend pace={pacePct} />

      {rows.map(({ o, rollup }, oi) => (
        <section key={o.id} id={`objective-${objectiveCode(oi).toLowerCase()}`} className="admin-card u-mb-4 u-p-0 u-clip">
          <div className="admin-goals-head">
            <Ring pct={rollup.pct} tone={rollup.tone} size="lg" />
            <div className="admin-goals-headtxt">
              <div className="admin-goals-eyebrow">
                <span className={`admin-edges-ltag admin-edges-ltag--${o.brand ?? "company"}`}>{BRAND_LABELS[o.brand ?? "company"]}</span>
                {objectiveCode(oi)}
              </div>
              <h3>{o.title}</h3>
              <RollupCounts rollup={rollup} />
            </div>
            <StatusPill tone={rollup.tone} label={OBJECTIVE_TONE_LABEL[rollup.tone]} />
          </div>
          {o.krs.map((kr, ki) => {
            const p = krProgress(kr, !unmeasured.has(kr.id));
            return (
              <div key={kr.id} className="admin-goals-kr">
                <div className="admin-goals-krtitle">
                  <span className="admin-kr-index">{krCode(oi, ki)}</span>
                  {kr.title}
                </div>
                <Owners kr={kr} initialsById={initialsById} />
                <div className="admin-goals-prog">
                  <div className="admin-goals-progtop">
                    {!p.measured ? (
                      <span className="admin-goals-nm">Not measured yet</span>
                    ) : (
                      <span className="admin-goals-val">
                        {p.value}
                        <span>{p.target == null ? "no target set" : `of ${p.target}${p.unit ? ` ${p.unit}` : ""}`}</span>
                      </span>
                    )}
                    {p.tone === "hit" ? (
                      <span className="admin-goals-hit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                        Hit
                      </span>
                    ) : p.pct != null ? (
                      <span className="admin-goals-pct">
                        {(p.tone === "off" || p.tone === "risk") && <b className={`admin-goals-tone--${p.tone}`}>{KR_TONE_LABEL[p.tone]}</b>} {p.pct}%
                      </span>
                    ) : null}
                  </div>
                  <GoalBar pct={p.pct} pace={p.paced ? pacePct : null} tone={p.tone} />
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
