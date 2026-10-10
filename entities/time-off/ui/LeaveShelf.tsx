import { Fragment, type ReactNode } from "react";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate, humanize } from "@/kernel/ui/format";
import { hoursToDays, policyYearFor, type LedgerLine } from "../lib/balance";
import type { MemberLeave } from "../lib/balances";
import type { BalanceReview, LeaveWarning } from "../lib/review";
import { LEAVE_TYPE_LABEL, countWorkingDays, statusTone, type LeaveType } from "../lib/leave";
import { formatNumber } from "../lib/policy";

export type ShelfLeaveEntry = {
  id: string;
  leaveType: string;
  status: string;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
};

const DEDUCTING = new Set(["approved", "taken"]);

// The per-person leave shelf a manager reviews a balance with: the dates the
// policy counts from, how today's balance adds up, every event the balance
// walked with the balance after it, and the whole leave history grouped by
// policy year. It renders only what the calculation produced
// (entities/time-off/lib/balance.ts), so the shelf and the balance column can
// never disagree. Server component, passed as a PreviewRow's drawer body by the
// admin History page and the client portal; callers never pass reasons or notes.
export function LeaveShelf({
  leave,
  history,
  details,
  warnings,
  review,
  reviewAction,
  holidays = [],
}: {
  leave: MemberLeave | null;
  history: ShelfLeaveEntry[];
  details?: { label: string; value: ReactNode }[];
  // The days the office was shut, so the per-entry day count matches the one
  // the request was agreed at rather than counting closures as leave.
  holidays?: string[];
  // What to check (lib/review.ts) and the latest sign-off; reviewAction is the
  // confirm control for someone allowed to sign off.
  warnings?: LeaveWarning[];
  review?: BalanceReview | null;
  reviewAction?: ReactNode;
}) {
  const policy = leave?.policy ?? null;
  const b = leave?.balance ?? null;
  const hpd = policy?.accrual.hoursPerDay ?? 8;
  const days = (h: number) => formatNumber(hoursToDays(h, hpd));
  const signed = (h: number) => `${h > 0 ? "+" : h < 0 ? "−" : ""}${days(Math.abs(h))}`;
  const walkFrom = leave?.opening?.date ?? leave?.anniversaryDate ?? null;
  const typeLabel = (t: string) => LEAVE_TYPE_LABEL[t as LeaveType] ?? t;

  function ledgerLabel(l: LedgerLine): string {
    switch (l.kind) {
      case "opening":
        return "Opening balance";
      case "accrual":
        return `Accrual, year ${l.serviceYear ?? ""}`.trim();
      case "adjustment":
        return "Manual adjustment";
      case "forfeit":
        return "Forfeited above the carry-over cap";
      default:
        return `${typeLabel(l.leaveType ?? "")}${l.endDate && l.endDate !== l.date ? ` to ${formatDate(l.endDate)}` : ""}`;
    }
  }

  // History, newest first, grouped by the policy year each request starts in.
  const groups: { key: string; label: string; entries: ShelfLeaveEntry[] }[] = [];
  for (const e of [...history].sort((x, y) => y.startDate.localeCompare(x.startDate))) {
    let key = "all";
    let label = "All time off";
    if (policy && leave?.anniversaryDate) {
      const py = policyYearFor(policy.accrual.yearBasis, leave.anniversaryDate, e.startDate);
      if (!py) {
        key = "before";
        label = "Before the policy start";
      } else if (policy.accrual.yearBasis === "anniversary") {
        key = `y${py.year}`;
        label = `Policy year ${py.year}: ${formatDate(py.start)} to ${formatDate(py.end)}`;
      } else {
        key = `c${py.year}`;
        label = String(py.year);
      }
    }
    const group = groups.find((g) => g.key === key);
    if (group) group.entries.push(e);
    else groups.push({ key, label, entries: [e] });
  }

  return (
    <div className="u-stack u-gap-4">
      {warnings && b && (
        <section>
          <h3 className="admin-card-title u-mb-2">Review</h3>
          {warnings.length > 0 ? (
            <div className="admin-banner-warn u-mb-2">
              <ul className="u-stack u-gap-1">
                {warnings.map((w) => (
                  <li key={w.kind}>{w.text}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="admin-cell-muted u-mb-2">Nothing to flag.</p>
          )}
          <p className="u-mb-2">
            {review ? (
              <>
                <Badge tone={review.current ? "ok" : "warn"}>
                  {review.current ? "Confirmed" : "Changed since confirmed"}
                </Badge>
                <span className="admin-cell-muted">
                  {" "}
                  by {review.reviewerLabel ?? "unknown"} on {formatDate(review.reviewedAt.slice(0, 10))}
                </span>
              </>
            ) : (
              <Badge tone="warn">Not confirmed yet</Badge>
            )}
          </p>
          {reviewAction}
        </section>
      )}
      <section>
        <h3 className="admin-card-title u-mb-2">Dates and policy</h3>
        <dl className="admin-kv">
          <dt>Start date</dt>
          <dd>{leave?.startDate ? formatDate(leave.startDate) : "Not set"}</dd>
          <dt>Policy start</dt>
          <dd>
            {leave?.anniversaryDate ? formatDate(leave.anniversaryDate) : "Not set"}
            {leave?.anniversaryDate && !leave.probationRecorded && (
              <span className="admin-cell-muted"> · probation end not recorded, using the start date</span>
            )}
          </dd>
          <dt>Leave policy</dt>
          <dd>{policy?.name ?? "None assigned"}</dd>
          {b?.policyYearStart && b.policyYearEnd && (
            <>
              <dt>Policy year</dt>
              <dd>
                {policy?.accrual.yearBasis === "anniversary" ? `Year ${b.serviceYear}: ` : ""}
                {formatDate(b.policyYearStart)} to {formatDate(b.policyYearEnd)}
              </dd>
            </>
          )}
          {b?.tier && (
            <>
              <dt>Entitlement</dt>
              <dd>
                {days(b.tier.hoursPerYear)} days a year
                <span className="admin-cell-muted"> · {formatNumber(b.tier.hoursPerPeriod)} h per posting</span>
              </dd>
            </>
          )}
          {b?.nextStepUp && (
            <>
              <dt>Next step-up</dt>
              <dd>
                {days(b.nextStepUp.hoursPerYear)} days a year from {formatDate(b.nextStepUp.date)}
              </dd>
            </>
          )}
          {b?.nextCapCheck && (
            <>
              <dt>Next cap check</dt>
              <dd>
                {formatDate(b.nextCapCheck.date)}
                <span className="admin-cell-muted">
                  {b.nextCapCheck.atRiskHours > 0 ? ` · ${days(b.nextCapCheck.atRiskHours)} days at risk` : " · nothing at risk"}
                </span>
              </dd>
            </>
          )}
          {details?.map((d) => (
            <Fragment key={d.label}>
              <dt>{d.label}</dt>
              <dd>{d.value}</dd>
            </Fragment>
          ))}
        </dl>
      </section>

      {b ? (
        <section>
          <h3 className="admin-card-title u-mb-2">How the balance adds up</h3>
          <dl className="admin-kv">
            {leave?.opening && (
              <>
                <dt>Opening balance</dt>
                <dd className="admin-cell-mono">
                  {days(b.anchorHours)}
                  <span className="admin-cell-muted">
                    {" "}
                    on {formatDate(leave.opening.date)} ({formatNumber(leave.opening.openingDays)} opening,{" "}
                    {formatNumber(leave.opening.carryoverDays)} carried over)
                  </span>
                </dd>
              </>
            )}
            <dt>Carried into this year</dt>
            <dd className="admin-cell-mono">
              {days(b.openingHours)}
              {b.policyYearStart && <span className="admin-cell-muted"> on {formatDate(b.policyYearStart)}</span>}
            </dd>
            <dt>Accrued this year</dt>
            <dd className="admin-cell-mono">{signed(b.accruedPolicyYearHours)}</dd>
            {b.adjustedPolicyYearHours !== 0 && (
              <>
                <dt>Adjustments this year</dt>
                <dd className="admin-cell-mono">{signed(b.adjustedPolicyYearHours)}</dd>
              </>
            )}
            <dt>Used this year</dt>
            <dd className="admin-cell-mono">{signed(-b.usedPolicyYearHours)}</dd>
            <dt>Available balance</dt>
            <dd className="admin-cell-mono">
              <span className={`admin-cell-strong${b.remainingHours < 0 ? " u-warn" : ""}`}>{days(b.remainingHours)} days</span>
              <span className="admin-cell-muted"> · {formatNumber(b.remainingHours)} h</span>
            </dd>
            {b.pendingHours > 0 && (
              <>
                <dt>Pending</dt>
                <dd className="admin-cell-mono">{days(b.pendingHours)} days awaiting approval</dd>
              </>
            )}
            <dt>Accrued, all time</dt>
            <dd className="admin-cell-mono">
              {days(b.accruedHours)}
              {walkFrom && <span className="admin-cell-muted"> since {formatDate(walkFrom)}</span>}
            </dd>
            {b.adjustedHours !== 0 && (
              <>
                <dt>Adjustments, all time</dt>
                <dd className="admin-cell-mono">{signed(b.adjustedHours)}</dd>
              </>
            )}
            <dt>Used, all time</dt>
            <dd className="admin-cell-mono">{days(b.usedAllTimeHours)}</dd>
            {b.forfeitedHours > 0 && (
              <>
                <dt>Forfeited, all time</dt>
                <dd className="admin-cell-mono">{signed(-b.forfeitedHours)}</dd>
              </>
            )}
          </dl>
        </section>
      ) : (
        <p className="admin-cell-muted">
          No balance: {policy ? "this policy has no paid leave." : "no leave policy is assigned."}
        </p>
      )}

      {b && b.ledger.length > 0 && (
        <section>
          <h3 className="admin-card-title u-mb-2">Ledger</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Entry</th>
                  <th>Days</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {b.ledger.map((l, i) => (
                  <tr key={`${l.date}-${l.kind}-${i}`}>
                    <td>{formatDate(l.date)}</td>
                    <td>{ledgerLabel(l)}</td>
                    <td className="admin-cell-mono">{l.kind === "opening" ? days(l.hours) : signed(l.hours)}</td>
                    <td className="admin-cell-mono">{days(l.balanceHours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h3 className="admin-card-title u-mb-2">Time off history</h3>
        {groups.length === 0 ? (
          <p className="admin-cell-muted">No time off recorded.</p>
        ) : (
          groups.map((g) => (
            <div key={g.key} className="u-mb-3">
              <div className="admin-cell-muted u-sm u-mb-1">{g.label}</div>
              <div className="admin-list">
                {g.entries.map((e) => {
                  const n = countWorkingDays(e.startDate, e.endDate, e.isHalfDay, holidays);
                  const inBank = !policy || policy.accrual.bankLeaveTypes.includes(e.leaveType);
                  const inOpening =
                    inBank && DEDUCTING.has(e.status) && !!leave?.opening && e.startDate <= leave.opening.date;
                  return (
                    <div className="admin-list-row" key={e.id}>
                      <div className="admin-list-main">
                        <div className="admin-list-title">
                          {typeLabel(e.leaveType)} · {formatNumber(n)} {n === 1 ? "day" : "days"}
                        </div>
                        <div className="admin-list-sub">
                          {e.startDate === e.endDate
                            ? formatDate(e.startDate)
                            : `${formatDate(e.startDate)} to ${formatDate(e.endDate)}`}
                          {!inBank && " · not deducted from the leave bank"}
                          {inOpening && " · included in the opening balance"}
                        </div>
                      </div>
                      <div className="admin-list-aside">
                        <Badge tone={statusTone(e.status)}>{humanize(e.status)}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
