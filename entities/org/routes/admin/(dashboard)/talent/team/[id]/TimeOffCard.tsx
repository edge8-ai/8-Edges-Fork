import { Badge } from "@/kernel/ui/Badge";
import { formatDate, humanize } from "@/kernel/ui/format";
import {
  LEAVE_TYPE_LABEL,
  countWorkingDays,
  formatDays,
  listHolidayDatesCovering,
  statusTone as leaveStatusTone,
} from "@/entities/time-off";

export type LeaveRow = {
  id: string;
  leave_type: string;
  status: string;
  start_date: string;
  end_date: string;
  is_half_day: boolean;
  days: number | string | null;
  reason: string | null;
};

const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
};

// The member's time-off requests, newest first, with the working days each one
// costs (the stored figure when there is one, counted against the holidays
// otherwise).
export function TimeOffCard({
  requests,
  leaveHolidays,
}: {
  requests: LeaveRow[];
  leaveHolidays: Awaited<ReturnType<typeof listHolidayDatesCovering>>;
}) {
  return (
    <div className="admin-card admin-section-card">
      <h2 className="admin-card-title">Time off ({requests.length})</h2>
      {requests.length === 0 ? (
        <div className="admin-empty">No time-off requests yet.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Dates</th>
                <th>Days</th>
                <th>Status</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const days =
                  num(r.days) ?? countWorkingDays(r.start_date, r.end_date, r.is_half_day, leaveHolidays);
                const range =
                  r.start_date === r.end_date
                    ? formatDate(r.start_date) + (r.is_half_day ? " (half)" : "")
                    : `${formatDate(r.start_date)} → ${formatDate(r.end_date)}`;
                return (
                  <tr key={r.id}>
                    <td>
                      {LEAVE_TYPE_LABEL[r.leave_type as keyof typeof LEAVE_TYPE_LABEL] ??
                        humanize(r.leave_type)}
                    </td>
                    <td>{range}</td>
                    <td>{days > 0 ? formatDays(days) : "—"}</td>
                    <td>
                      <Badge tone={leaveStatusTone(r.status)}>{humanize(r.status)}</Badge>
                    </td>
                    <td className="admin-cell-muted">{r.reason || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
