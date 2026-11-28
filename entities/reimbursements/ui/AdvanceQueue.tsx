import Link from "next/link";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate, formatVndWhole } from "@/kernel/ui/format";
import { ADVANCE_TABS, closedAheadOfClaim, queueFigures, tabOf } from "../lib/advance-books";
import type { QueuedAdvance } from "../lib/advance-queue";
import { PUT_BACK_LABEL, ADVANCE_STATUS_LABEL_TO_OTHERS, ADVANCE_STATUS_TONE, advanceRef, isOverdue, isSettling } from "../lib/advance-rules";

// Every advance under its tabs, with the four figures above them, the same for Finance and for
// Admin. A tab is a link, so a tab survives a reload and each can be sent to someone. Every
// status sits under exactly one tab, which advance-books tests, so nothing goes missing.
export function AdvanceQueue({ queue, showing, today, base }: { queue: QueuedAdvance[]; showing: (typeof ADVANCE_TABS)[number]["key"]; today: string; base: string }) {
  const figures = queueFigures(queue.map((q) => ({ putBack: q.putBack, status: q.row.status, amountVnd: q.row.amountVnd, balanceVnd: q.row.balanceVnd, returnedVnd: q.returnedVnd, claimStatus: q.claimStatus, settleBy: q.row.settleBy })), today);
  const grouped = queue.map((q) => ({ ...q, tab: tabOf({ status: q.row.status, claimStatus: q.claimStatus }) }));
  const rows = grouped.filter((q) => q.tab === showing);
  const ahead = queue.filter((q) => closedAheadOfClaim({ status: q.row.status, spentVnd: q.spentVnd, claimStatus: q.claimStatus }));

  return (
    <>
      {ahead.length > 0 && (
        <div className="admin-alert admin-alert--warn u-mb-4" role="status">
          {ahead.map((q) => advanceRef(q.row.refNo)).join(", ")} closed, but {ahead.length === 1 ? "its settlement did" : "their settlements did"} not finish moving. Approving the claim again finishes it.
        </div>
      )}
      <div className="admin-kpi-grid u-mb-4">
        <div className="admin-kpi"><div className="admin-kpi-label">To transfer</div><div className="admin-kpi-val">{formatVndWhole(figures.toTransferVnd)}</div></div>
        <div className="admin-kpi"><div className="admin-kpi-label">With people (account 141)</div><div className="admin-kpi-val">{formatVndWhole(figures.withPeopleVnd)}</div></div>
        <div className="admin-kpi"><div className="admin-kpi-label">Coming back</div><div className="admin-kpi-val">{formatVndWhole(figures.comingBackVnd)}</div></div>
        <div className="admin-kpi"><div className="admin-kpi-label">Overdue</div><div className="admin-kpi-val">{figures.overdue}</div></div>
      </div>
      <nav className="admin-tabs" aria-label="Advances by stage">
        {ADVANCE_TABS.map((t) => (
          <Link key={t.key} href={`${base}?tab=${t.key}`} className={`admin-tab${t.key === showing ? " is-active" : ""}`} aria-current={t.key === showing ? "page" : undefined}>
            {t.label}
            <span className="admin-tab-count">{grouped.filter((q) => q.tab === t.key).length}</span>
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <div className="admin-empty">Nothing here.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Person</th><th>Advance</th><th>Amount</th><th>Settle by</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map(({ row, ownerName, claimStatus, putBack }) => {
                const overdue = isOverdue({ status: row.status, settleBy: row.settleBy, claimStatus }, today);
                const settling = isSettling({ status: row.status, claimStatus });
                return (
                  <tr key={row.id}>
                    <td className="u-strong">{ownerName}</td>
                    <td>{row.purpose}<div className="admin-list-sub admin-cell-mono">{advanceRef(row.refNo)}</div></td>
                    <td className="admin-cell-mono">{formatVndWhole(row.amountVnd)}</td>
                    <td>{row.settleBy ? formatDate(row.settleBy) : "—"}</td>
                    <td><Badge tone={overdue ? "err" : putBack ? "warn" : ADVANCE_STATUS_TONE[row.status]}>{overdue ? "Overdue" : settling ? "Settling" : putBack ? PUT_BACK_LABEL : ADVANCE_STATUS_LABEL_TO_OTHERS[row.status]}</Badge></td>
                    <td><Link href={`${base}/${row.id}`}>Open</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
