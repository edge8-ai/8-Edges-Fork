"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import {
  LEAVE_TYPES,
  LEAVE_TYPE_LABEL,
  countWorkingDays,
  formatDays,
  statusTone,
} from "@/entities/time-off/client";
import { cancelOwnTimeOff, requestOwnTimeOff } from "./actions";
import { saigonToday } from "@/kernel/config/dates";

export type OwnRequestRow = {
  id: string;
  leaveType: string;
  status: string;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  reason: string | null;
  // The count the request was recorded at, when it has one. Older rows predate
  // the column and fall back to a count derived from the dates.
  days: number | null;
};

const todayIso = () => saigonToday();

// Own-service mirror of the admin TimeOffBoard: same form/table shape, no
// team-member picker (the actor is implicit), and every row shown here already
// belongs to the signed-in employee (the page only ever fetches their own).
// `autoApprove` mirrors the actor's leave policy — display only; the server
// action re-resolves the policy itself and ignores anything the client claims.
export function TimeOffPanel({
  rows,
  autoApprove,
  holidays = [],
}: {
  rows: OwnRequestRow[];
  autoApprove: boolean;
  // The days the office is shut, loaded by the page. Passed as a plain array
  // because this crosses the server/client boundary; countWorkingDays takes
  // either shape.
  holidays?: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const [leaveType, setLeaveType] = useState<string>("vacation");
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [reason, setReason] = useState("");

  const previewDays = countWorkingDays(startDate, endDate, isHalfDay, holidays);

  function run<R extends { ok: true } | { ok: false; error: string }>(
    fn: () => Promise<R>,
    okText: string | ((res: Extract<R, { ok: true }>) => string),
  ) {
    setBanner(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        const text =
          typeof okText === "string" ? okText : okText(res as Extract<R, { ok: true }>);
        setBanner({ tone: "ok", text });
        router.refresh();
      } else {
        setBanner({ tone: "err", text: res.error });
      }
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    run(
      () => requestOwnTimeOff({ leaveType, startDate, endDate, isHalfDay, reason }),
      (res) =>
        res.autoApproved
          ? "Approved — your time off is booked."
          : "Request submitted for approval.",
    );
    setReason("");
  }

  return (
    <div className="admin-timeoff">
      {banner && (
        <div className={`admin-alert admin-alert--${banner.tone === "ok" ? "ok" : "err"}`}>
          {banner.text}
        </div>
      )}

      <div className="admin-card admin-section-card u-mb-5">
        <h2 className="admin-card-title">Request time off</h2>
        <p className="admin-cell-muted u-mb-3">
          {autoApprove
            ? "Your policy approves time off automatically — your manager and ops are notified."
            : "Requests are reviewed by ops before they're approved."}
        </p>
        <form className="admin-form" onSubmit={submit}>
          <div className="admin-timeoff-grid">
            <div className="admin-field">
              <label className="admin-label" htmlFor="to-type">Leave type</label>
              <select
                id="to-type"
                className="admin-select"
                value={leaveType}
                onChange={(e) => setLeaveType(e.target.value)}
              >
                {LEAVE_TYPES.map((t) => (
                  <option key={t} value={t}>{LEAVE_TYPE_LABEL[t]}</option>
                ))}
              </select>
            </div>

            <div className="admin-field">
              <label className="admin-label" htmlFor="to-start">Start date</label>
              <input
                id="to-start"
                className="admin-input"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (endDate < e.target.value) setEndDate(e.target.value);
                }}
                required
              />
            </div>

            <div className="admin-field">
              <label className="admin-label" htmlFor="to-end">End date</label>
              <input
                id="to-end"
                className="admin-input"
                type="date"
                value={endDate}
                min={startDate}
                disabled={isHalfDay}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          <label className="admin-timeoff-check">
            <input
              type="checkbox"
              checked={isHalfDay}
              onChange={(e) => {
                setIsHalfDay(e.target.checked);
                if (e.target.checked) setEndDate(startDate);
              }}
            />
            Half day
          </label>

          <div className="admin-field">
            <label className="admin-label" htmlFor="to-reason">Reason (optional)</label>
            <textarea
              id="to-reason"
              className="admin-textarea"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="admin-form-actions">
            <button type="submit" className="admin-btn admin-btn--primary" disabled={pending}>
              {pending ? "Saving…" : "Submit request"}
            </button>
            {previewDays > 0 && (
              <span className="admin-timeoff-preview">{formatDays(previewDays)} of leave</span>
            )}
          </div>
        </form>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Dates</th>
              <th>Days</th>
              <th>Status</th>
              <th>Reason</th>
              <th aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="admin-cell-muted">No time off requests yet.</td>
              </tr>
            ) : (
              rows.map((r) => {
                const days = r.days ?? countWorkingDays(r.startDate, r.endDate, r.isHalfDay, holidays);
                const range =
                  r.startDate === r.endDate
                    ? formatDate(r.startDate) + (r.isHalfDay ? " (half)" : "")
                    : `${formatDate(r.startDate)} → ${formatDate(r.endDate)}`;
                return (
                  <tr key={r.id}>
                    <td>{LEAVE_TYPE_LABEL[r.leaveType as keyof typeof LEAVE_TYPE_LABEL] ?? r.leaveType}</td>
                    <td>{range}</td>
                    <td>{days > 0 ? formatDays(days) : "—"}</td>
                    <td><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
                    <td className="admin-cell-muted">{r.reason || "—"}</td>
                    <td>
                      {(r.status === "requested" || r.status === "approved") && (
                        <div className="admin-timeoff-actions">
                          <button
                            className="admin-btn admin-btn--sm"
                            disabled={pending}
                            onClick={() => run(() => cancelOwnTimeOff(r.id), "Request cancelled.")}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
