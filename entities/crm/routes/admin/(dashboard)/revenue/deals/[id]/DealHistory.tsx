import { formatDate } from "@/kernel/ui/format";
import type { StageHistoryRow } from "@/entities/crm/lib/deal-stage";

// The deal's stage history from deal_stage_log (RH-2), newest first. The seed
// row marks where the log begins; nothing before it is known, and the page
// says so rather than inferring a history from updated_at.
export function DealHistory({ rows, stageNames }: { rows: StageHistoryRow[]; stageNames: Map<string, string> }) {
  const name = (id: string | null) => (id ? stageNames.get(id) ?? "Unknown stage" : null);
  return (
    <div className="admin-card admin-section-card">
      <div className="admin-kpi-label u-mb-2">Stage history</div>
      {rows.length === 0 ? (
        <div className="admin-empty">No stage moves recorded yet. The log starts with the next move.</div>
      ) : (
        <div className="admin-list">
          {rows.map((r) => (
            <div key={r.id} className="admin-list-row">
              <div className="admin-list-main">
                <div className="admin-list-title">
                  {r.kind === "seed"
                    ? `Log started in ${name(r.to_stage_id) ?? "the current stage"}`
                    : r.kind === "create"
                      ? `Created in ${name(r.to_stage_id) ?? "the first stage"}`
                      : `${name(r.from_stage_id) ?? "No stage"} → ${name(r.to_stage_id) ?? "No stage"}`}
                </div>
                {r.note && r.kind !== "seed" && <div className="admin-list-sub">{r.note}</div>}
              </div>
              <div className="admin-list-aside">
                <span className="admin-list-sub">{formatDate(r.moved_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
