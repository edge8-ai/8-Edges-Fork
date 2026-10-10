import {
  BRAND_LABELS,
  agentInitials,
  krCode,
  objectiveCode,
  progressPct,
  type KrRow,
} from "@/entities/org/lib/company/edges-shared";
import type { ObjectiveWithKrs } from "@/entities/org/lib/company/goal-shapes";

// Read-only "Company goals" tab: each company objective as a card with its key
// results, owner avatars, and progress bars. Shared by /team/company-goals and
// the admin Company section (the admin page adds inline edit controls around
// this via CompanyGoalsEditor).
export function fmtValue(kr: KrRow): string {
  const t = kr.target_value == null ? null : Number(kr.target_value);
  const c = Number(kr.current_value);
  if (kr.unit === "usd") return `$${(c / 1000).toFixed(c >= 100000 ? 0 : 1)}k`;
  if (kr.unit === "%") return `${c}%`;
  if (kr.unit === "min") return `${c}m`;
  if (kr.unit === "days") return `${c}d`;
  if (t != null && kr.direction === "up" && t <= 20) return `${c}/${t}`;
  return `${c}`;
}

export function barClass(kr: KrRow): string {
  const pct = progressPct(kr);
  if (kr.status === "done" || pct >= 100) return "is-done";
  if (kr.status === "at_risk" || kr.status === "off_track") return "is-risk";
  return "";
}

export function CompanyGoalsObjectives({
  tree,
  initialsById,
  emptyLabel,
}: {
  tree: ObjectiveWithKrs[];
  initialsById: Record<string, string>;
  emptyLabel: string;
}) {
  return (
    <>
      {tree.length === 0 && <div className="admin-empty">{emptyLabel}</div>}

      {tree.map((o, oi) => (
        <div key={o.id} className="admin-card u-mb-4 u-p-0 u-clip">
          <div className="admin-edges-ohead">
            <span className={`admin-edges-ltag admin-edges-ltag--${o.brand ?? "company"}`}>
              {BRAND_LABELS[o.brand ?? "company"]}
            </span>
            <h3>
              {objectiveCode(oi)} · {o.title}
            </h3>
            <span className="admin-edges-ohead-note">
              {Math.round(o.krs.reduce((s, kr) => s + progressPct(kr), 0) / Math.max(1, o.krs.length))}% ·{" "}
              {o.krs.some((kr) => kr.status === "off_track")
                ? "off track"
                : o.krs.some((kr) => kr.status === "at_risk")
                  ? "watch"
                  : "on track"}
            </span>
          </div>
          {o.krs.map((kr, ki) => (
            <div key={kr.id} className="admin-edges-kr">
              <div className="admin-edges-kr-row">
                <div className="admin-edges-kr-title">
                  <span className="admin-kr-index">
                    {krCode(oi, ki)}
                  </span>
                  {kr.title}
                </div>
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
                <span className="admin-edges-prog">
                  <span className="admin-edges-prog-bar">
                    <i className={barClass(kr)} style={{ width: `${Math.min(100, progressPct(kr))}%` }} /* layout-ok: data-driven width */ />
                  </span>
                  <span className="admin-edges-prog-val">{fmtValue(kr)}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
