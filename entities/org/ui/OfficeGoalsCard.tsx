import Link from "next/link";
import { Badge } from "@/kernel/ui/Badge";
import { krStatusTone, type OfficeSnapshot } from "@/entities/org/lib/office-goals";
import type { KrStatus } from "@/entities/org/lib/company/edges-shared";

const STATUS_LABEL: Record<KrStatus, string> = {
  on_track: "on track",
  at_risk: "at risk",
  off_track: "off track",
  done: "done",
};

// The "this office's key results" card shared by all four cockpits: each key
// result with its status badge, laddering back to the shared goals surface.
export function OfficeGoalsCard({ snapshot, quarterLabel }: { snapshot: OfficeSnapshot; quarterLabel: string }) {
  const krs = snapshot.objectives.flatMap((o) => o.krs);
  return (
    <div className="admin-card admin-section-card">
      <h2 className="admin-card-title">Key results · {quarterLabel}</h2>
      {krs.length === 0 ? (
        <div className="admin-empty">No key results set for this office this quarter.</div>
      ) : (
        <div className="admin-list">
          {krs.map((kr) => (
            <div key={kr.id} className="admin-list-row">
              <div className="admin-list-main">
                <div className="admin-list-title">{kr.title}</div>
              </div>
              <div className="admin-list-aside">
                <Badge tone={krStatusTone(kr.status)} dot>
                  {STATUS_LABEL[kr.status]}
                </Badge>
              </div>
            </div>
          ))}
          <div className="u-mt-3">
            <Link href="/admin/company/goals" className="admin-auth-link">
              Open goals →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
