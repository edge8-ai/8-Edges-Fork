import { LEAVE_TYPE_LABEL, type LeaveType } from "../lib/leave";
import { COUNTS_FROM_LABEL, describeTiers, formatNumber, type LeavePolicySummary } from "../lib/policy";
import { hoursToDays } from "../lib/balance";

// The "How it works" guide a client manager reads once: how leave is earned,
// when the year turns, what each figure on the Balances tab means, how a
// request moves, and what the Check column asks of them. The mechanics are the
// same for every policy; the numbers (posting days, entitlement, cap) come
// from the policy passed in so the guide never contradicts the Policy tab.
// Server component; renders nothing personal.
export function HowItWorks({ policy }: { policy: LeavePolicySummary | null }) {
  const a = policy?.accrual ?? null;
  const hpd = a?.hoursPerDay ?? 8;
  const anniversary = a?.yearBasis === "anniversary";
  const from = COUNTS_FROM_LABEL[policy?.countsFrom ?? "probation_end"];
  const postingDays =
    a?.cadence === "semi_monthly"
      ? "on the 15th and the last day of each month"
      : a?.cadence === "monthly"
        ? "on the last day of each month"
        : "each pay period";
  const yearStart = anniversary
    ? `the anniversary of ${from}`
    : "1 January";
  const cap =
    a === null || a.carryCapHours === null
      ? "Unused hours carry over without limit."
      : a.carryCapHours === 0
        ? "Nothing carries over: hours not taken by the last day of the year are forfeited."
        : `Up to ${formatNumber(a.carryCapHours)} hours (${formatNumber(hoursToDays(a.carryCapHours, hpd))} days) carry into the next year; anything above that is forfeited on the day the year turns.`;
  const bank = a ? a.bankLeaveTypes.map((t) => LEAVE_TYPE_LABEL[t as LeaveType] ?? t).join(", ") : "vacation";
  const tiers = a ? describeTiers(a) : [];
  const increments =
    a === null
      ? "half days or whole days"
      : a.minIncrementHours >= hpd
        ? "whole days"
        : a.minIncrementHours * 2 === hpd
          ? "half days or whole days"
          : `blocks of ${formatNumber(a.minIncrementHours)} hour${a.minIncrementHours === 1 ? "" : "s"}`;

  return (
    <div className="admin-card admin-section-card">
      <h2 className="admin-card-title">How time off works</h2>
      <div className="u-max-prose u-stack u-gap-4">
        <section>
          <h3 className="admin-section-label">1. Hours are earned a little at a time</h3>
          <p>
            Paid time off is not granted up front. It accrues in small postings {postingDays}, from {from}. The yearly
            entitlement is spread evenly across those postings. It steps up with length of service, counted from{" "}
            {from}: the first posting after each anniversary is at the new rate, and that rate runs for the rest of the
            year and through the next.
          </p>
          {tiers.length > 0 && (
            <ul>
              {tiers.map((t) => (
                <li key={t.years}>
                  {t.years}: {t.days}
                  {t.perPeriod ? <span className="admin-cell-muted"> ({t.perPeriod})</span> : null}
                </li>
              ))}
            </ul>
          )}
          <p>
            The exact rate for each person, and the date of their next posting, are on the Policy tab and in that row
            on the Balances tab.
          </p>
        </section>

        <section>
          <h3 className="admin-section-label">2. The leave year</h3>
          <p>
            The leave year starts on {yearStart}
            {anniversary
              ? ", so it is different for every person"
              : ", for everyone, whatever their anniversary"}
            . {cap}
            {!anniversary && " The cap applies at the calendar year end whatever rate the person earns at."}
          </p>
        </section>

        <section>
          <h3 className="admin-section-label">3. Reading the Balances tab</h3>
          <dl className="admin-kv">
            <dt>Policy start</dt>
            <dd>The day accrual began ({from}). The leave year is counted from here too.</dd>
            <dt>Policy year</dt>
            <dd>Which year of service the person is in, and the day the current year began.</dd>
            <dt>Opening balance</dt>
            <dd>
              The hours the person carried into the current leave year, after the carry-over rule was applied on the
              day the year turned. Zero for someone who started this year.
            </dd>
            <dt>Accrued this year</dt>
            <dd>Every posting since the current year began, up to today.</dd>
            <dt>Used this year</dt>
            <dd>Approved leave that started in the current year. Pending requests are not counted yet.</dd>
            <dt>Available balance</dt>
            <dd>
              Opening balance, plus accrued this year, minus used this year. This is what the person can take today.
              A pending figure beside it is leave that has been requested but not yet decided. A negative figure means
              leave was approved beyond what had accrued.
            </dd>
          </dl>
          <p>
            Leave draws from one bank that covers {bank}. Weekends are not counted. Leave is taken in {increments}. Every
            figure is recomputed from the leave records each time the page loads, so there is no separate ledger to
            reconcile: open a row to see the postings and deductions line by line.
          </p>
        </section>

        <section>
          <h3 className="admin-section-label">4. Requests and approval</h3>
          <p>
            A team member submits a request on their own Edge8 page. It shows here immediately as Pending, in
            Upcoming on the Overview tab and on the calendar. If you are the manager named on the placement of that person,
            the request also appears in your decision list at the top of the Overview tab, where you approve or decline
            it. Once approved it is deducted from the balance. A pending request that covers today shows under Out now
            with its Pending badge so nobody is surprised.
          </p>
          <p>
            Statuses: <strong>Pending</strong> (requested, not yet decided), <strong>Approved</strong>,{" "}
            <strong>Declined</strong>, <strong>Cancelled</strong> (withdrawn by the person or by Edge8) and{" "}
            <strong>Taken</strong>. Only a pending request can be decided here; Edge8 operations can still cancel or
            revisit a request if something changes.
          </p>
        </section>

        <section>
          <h3 className="admin-section-label">5. The Check column</h3>
          <p>
            Check tells you whether a balance needs a look. <strong>N to check</strong> lists things worth confirming
            with Edge8: a missing probation end date, a negative balance, or more leave used this year than the
            yearly entitlement. <strong>Not confirmed</strong> means the balance looks fine but nobody has signed it
            off yet. <strong>Confirmed</strong> means the named manager checked it and nothing has changed since.
            Open the row and use the confirm button to sign off; any later change to the inputs (new leave,
            an adjustment, a policy edit) clears the sign-off and asks for another look.
          </p>
        </section>

        <section>
          <h3 className="admin-section-label">6. Dates and time zone</h3>
          <p>
            The team works in Vietnam, so today, Out now and Upcoming follow the Vietnam calendar date (GMT+7). A
            half day counts as half a day of leave whichever half it is.
          </p>
        </section>
      </div>
    </div>
  );
}
