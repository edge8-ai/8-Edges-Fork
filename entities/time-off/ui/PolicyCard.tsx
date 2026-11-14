import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { hoursToDays, type LeaveBalance } from "../lib/balance";
import { LEAVE_TYPE_LABEL, type LeaveType } from "../lib/leave";
import {
  CADENCE_LABEL,
  COUNTS_FROM_LABEL,
  YEAR_BASIS_LABEL,
  describeTiers,
  formatNumber,
  policyParagraphs,
  type LeavePolicySummary,
} from "../lib/policy";

// The one policy card every surface shows: the rules as a key/value list, the
// entitlement by service year, and the policy text. When a member's balance
// is passed it adds that person's place in the policy (service year, rate,
// next posting, next step-up, hours at risk) so the employee, their client
// manager and the admin read the same facts from the same component.
export function PolicyCard({
  policy,
  balance,
  anniversaryDate,
  title,
}: {
  policy: LeavePolicySummary;
  balance?: LeaveBalance | null;
  anniversaryDate?: string | null;
  title?: string;
}) {
  const a = policy.accrual;
  const tiers = describeTiers(a);
  const paragraphs = policyParagraphs(policy.policyText);
  const hpd = a.hoursPerDay;
  const bank = a.bankLeaveTypes.map((t) => LEAVE_TYPE_LABEL[t as LeaveType] ?? t).join(", ");

  return (
    <div className="admin-card admin-section-card">
      <div className="admin-card-head u-mb-3">
        <h2 className="admin-card-title">{title ?? policy.name}</h2>
        <Badge tone={policy.autoApprove ? "ok" : "warn"}>
          {policy.autoApprove ? "auto-approved" : "manual approval"}
        </Badge>
      </div>

      {a.cadence === "none" ? (
        <p className="admin-cell-muted">No paid leave accrues under this policy.</p>
      ) : (
        <dl className="admin-kv">
          <dt>Leave year</dt>
          <dd>{YEAR_BASIS_LABEL[a.yearBasis]}</dd>
          <dt>Accrual</dt>
          <dd>{CADENCE_LABEL[a.cadence]}</dd>
          <dt>Entitlement</dt>
          <dd>
            {tiers.map((t) => (
              <div key={t.years}>
                {t.years}: {t.days}
                {t.perPeriod ? <span className="admin-cell-muted"> · {t.perPeriod}</span> : null}
              </div>
            ))}
          </dd>
          <dt>Carry-over</dt>
          <dd>
            {a.carryCapHours === null
              ? "Unused hours carry over without limit"
              : a.carryCapHours === 0
                ? "Nothing carries into the next leave year"
                : `Up to ${formatNumber(a.carryCapHours)} h (${formatNumber(hoursToDays(a.carryCapHours, hpd))} days) carries over; the rest is forfeited`}
          </dd>
          <dt>Taken in</dt>
          <dd>
            {a.minIncrementHours >= hpd
              ? "Whole days"
              : a.minIncrementHours * 2 === hpd
                ? "Half days or whole days"
                : `Units of ${formatNumber(a.minIncrementHours)} h`}
          </dd>
          <dt>Draws from bank</dt>
          <dd>{bank}</dd>
        </dl>
      )}

      {balance && (
        <>
          <h3 className="admin-section-label u-mt-4">Where you are</h3>
          <dl className="admin-kv">
            {anniversaryDate && (
              <>
                <dt>Counted from</dt>
                <dd>{formatDate(anniversaryDate)} ({COUNTS_FROM_LABEL[policy.countsFrom]})</dd>
              </>
            )}
            <dt>Service year</dt>
            <dd>Year {balance.serviceYear}</dd>
            {balance.tier && (
              <>
                <dt>Current rate</dt>
                <dd>
                  {formatNumber(hoursToDays(balance.tier.hoursPerYear, hpd))} days a year
                  <span className="admin-cell-muted"> · {formatNumber(balance.tier.hoursPerPeriod)} h per period</span>
                </dd>
              </>
            )}
            {balance.nextAccrual && (
              <>
                <dt>Next posting</dt>
                <dd>
                  {formatNumber(balance.nextAccrual.hours)} h on {formatDate(balance.nextAccrual.date)}
                </dd>
              </>
            )}
            {balance.nextStepUp && (
              <>
                <dt>Next step-up</dt>
                <dd>
                  {formatNumber(hoursToDays(balance.nextStepUp.hoursPerYear, hpd))} days a year from{" "}
                  {formatDate(balance.nextStepUp.date)}
                </dd>
              </>
            )}
            {balance.nextCapCheck && (
              <>
                <dt>Year-end check</dt>
                <dd>
                  {formatDate(balance.nextCapCheck.date)}
                  {balance.nextCapCheck.atRiskHours > 0 ? (
                    <span className="u-warn">
                      {" "}· {formatNumber(balance.nextCapCheck.atRiskHours)} h (
                      {formatNumber(hoursToDays(balance.nextCapCheck.atRiskHours, hpd))} days) would be forfeited if not taken
                    </span>
                  ) : (
                    <span className="admin-cell-muted"> · nothing at risk today</span>
                  )}
                </dd>
              </>
            )}
            {balance.pendingHours > 0 && (
              <>
                <dt>Awaiting approval</dt>
                <dd>{formatNumber(hoursToDays(balance.pendingHours, hpd))} days requested, not yet deducted</dd>
              </>
            )}
          </dl>
        </>
      )}

      {paragraphs.length > 0 && (
        <>
          <h3 className="admin-section-label u-mt-4">The policy</h3>
          <div className="u-max-prose">
            {paragraphs.map((p, i) => (
              <p key={i} className="u-prewrap">
                {p}
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
