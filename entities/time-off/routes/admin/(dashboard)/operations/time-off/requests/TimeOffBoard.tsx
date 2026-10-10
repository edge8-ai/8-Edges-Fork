"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PersonSelect } from "@/entities/crm/client";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import {
  LEAVE_TYPES,
  LEAVE_TYPE_LABEL,
  countWorkingDays,
  formatDays,
  statusTone,
} from "@/entities/time-off/client";
import { cancelTimeOff, createTimeOff, decideTimeOff } from "./actions";
import { saigonToday } from "@/kernel/config/dates";

export type MemberOption = { id: string; name: string };

export type RequestRow = {
  id: string;
  memberName: string;
  leaveType: string;
  status: string;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  reason: string | null;
  days: number;
  requestedAt: string;
  isAutoApproved: boolean;
  // Set when the decision was made by a client manager in the portal.
  clientApproverName: string | null;
};

export type LeaderRow = { id: string; name: string; days: number };

const todayIso = () => saigonToday();

// Awareness-first board: upcoming/pending leave with decision controls is the
// primary surface; the "log time off for someone" form is collapsed behind a
// button because admins rarely file leave on someone's behalf.
// `holidays` is the days the office is shut, loaded by the page, so the form's
// day preview matches the count the action will store.
export function TimeOffBoard({ members, upcoming, all, topFive, bottomFive, holidays = [] }: {
  members: MemberOption[];
  upcoming: RequestRow[];
  all: RequestRow[];
  topFive: LeaderRow[];
  bottomFive: LeaderRow[];
  holidays?: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [memberId, setMemberId] = useState("");
  const [leaveType, setLeaveType] = useState<string>("vacation");
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [reason, setReason] = useState("");

  const previewDays = countWorkingDays(startDate, endDate, isHalfDay, holidays);

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string) {
    setBanner(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setBanner({ tone: "ok", text: okText });
        router.refresh();
      } else {
        setBanner({ tone: "err", text: res.error });
      }
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!memberId) return;
    run(
      () => createTimeOff({ teamMemberId: memberId, leaveType, startDate, endDate, isHalfDay, reason }),
      "Time off logged and approved.",
    );
    setReason("");
  }

  function requestsTable(rows: RequestRow[], emptyText: string) {
    return (
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Team member</th>
              <th>Type</th>
              <th>Dates</th>
              <th>Days</th>
              <th>Status</th>
              <th>Requested</th>
              <th>Reason</th>
              <th aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="admin-cell-muted">{emptyText}</td>
              </tr>
            ) : (
              rows.map((r) => {
                const range =
                  r.startDate === r.endDate
                    ? formatDate(r.startDate) + (r.isHalfDay ? " (half)" : "")
                    : `${formatDate(r.startDate)} → ${formatDate(r.endDate)}`;
                return (
                  <tr key={r.id}>
                    <td className="admin-cell-strong">{r.memberName}</td>
                    <td>{LEAVE_TYPE_LABEL[r.leaveType as keyof typeof LEAVE_TYPE_LABEL] ?? r.leaveType}</td>
                    <td>{range}</td>
                    <td>{r.days > 0 ? formatDays(r.days) : "—"}</td>
                    <td>
                      <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                      {r.isAutoApproved && <span className="admin-cell-muted"> auto</span>}
                      {r.clientApproverName && (
                        <span className="admin-cell-muted"> by {r.clientApproverName} (client)</span>
                      )}
                    </td>
                    <td className="admin-cell-muted">{formatDate(r.requestedAt.slice(0, 10))}</td>
                    <td className="admin-cell-muted">{r.reason || "—"}</td>
                    <td>
                      <div className="admin-timeoff-actions">
                        {r.status === "requested" && (
                          <>
                            <button
                              className="admin-btn admin-btn--sm admin-btn--primary"
                              disabled={pending}
                              onClick={() => run(() => decideTimeOff(r.id, "approved"), "Request approved.")}
                            >
                              Approve
                            </button>
                            <button
                              className="admin-btn admin-btn--sm admin-btn--danger"
                              disabled={pending}
                              onClick={() => run(() => decideTimeOff(r.id, "rejected"), "Request rejected.")}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {r.status === "approved" && (
                          <>
                            <button
                              className="admin-btn admin-btn--sm admin-btn--danger"
                              disabled={pending}
                              title="Deny this leave — overrides an approval, including auto-approvals"
                              onClick={() => run(() => decideTimeOff(r.id, "rejected"), "Leave denied.")}
                            >
                              Deny
                            </button>
                            <button
                              className="admin-btn admin-btn--sm"
                              disabled={pending}
                              title="Withdraw without rejecting (e.g. plans changed)"
                              onClick={() => run(() => cancelTimeOff(r.id), "Request cancelled.")}
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    );
  }

  function leaderCard(title: string, rows: LeaderRow[]) {
    return (
      <div className="admin-card">
        <h2 className="admin-card-title">{title}</h2>
        <table className="admin-table">
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <td className="admin-cell-strong">{l.name}</td>
                <td className="u-right">{formatDays(l.days)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="admin-timeoff">
      {banner && (
        <div className={`admin-alert admin-alert--${banner.tone === "ok" ? "ok" : "err"}`}>
          {banner.text}
        </div>
      )}

      <div
        className="u-row u-between u-mb-3"
      >
        <h2 className="admin-card-title">Upcoming &amp; pending</h2>
        <button className="admin-btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Hide form" : "Log time off"}
        </button>
      </div>

      {showForm && (
        <div className="admin-card admin-section-card u-mb-5">
          <h2 className="admin-card-title">Log time off for someone</h2>
          <p className="admin-cell-muted u-mb-3">
            Logged entries are approved immediately — you are the approver.
          </p>
          <form className="admin-form" onSubmit={submit}>
            <div className="admin-timeoff-grid">
              <div className="admin-field">
                <label className="admin-label" htmlFor="to-member">Team member</label>
                <PersonSelect
                  id="to-member"
                  value={memberId}
                  onChange={setMemberId}
                  emptyLabel="Select…"
                  options={members.map((m) => ({ value: m.id, label: m.name }))}
                />
              </div>

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
                {pending ? "Saving…" : "Log time off"}
              </button>
              {previewDays > 0 && (
                <span className="admin-timeoff-preview">{formatDays(previewDays)} of leave</span>
              )}
            </div>
          </form>
        </div>
      )}

      {requestsTable(upcoming, "No upcoming or pending leave.")}

      <div
        className="u-grid-auto-md u-gap-5 u-my-5"
      >
        {leaderCard("Most time off — 2026", topFive)}
        {leaderCard("Least time off — 2026", bottomFive)}
      </div>

      <h2 className="admin-card-title u-mb-3">All requests</h2>
      {requestsTable(all, "No time off requests yet.")}
    </div>
  );
}
