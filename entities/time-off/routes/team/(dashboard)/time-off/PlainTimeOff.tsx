import type { MayProp } from "@/kernel/identity/may-prop";
import { PageHead } from "@/kernel/ui/PageHead";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { ViewToggle } from "@/kernel/ui/ViewToggle";
import {
  PolicyCard,
  TimeOffCalendar,
  formatNumber,
  hoursToDays,
  type CalendarEntry,
  type LeaveBalance,
  type LeavePolicySummary,
  type OwnLeaveRow,
} from "@/entities/time-off";
import { TimeOffPanel } from "./TimeOffPanel";

// The Time Off page as it was before TH.6, for a policy that does not keep
// leave apart by type (TH.26, `tracksLeaveByType`): three balance tiles, then
// the request form and history, the calendar and the policy. The page reads the
// rows and the policy; this draws them.
export function PlainTimeOff({
  may,
  rows,
  autoApprove,
  policy,
  balance,
  anniversaryDate,
  holidays,
}: {
  may: MayProp;
  rows: OwnLeaveRow[];
  autoApprove: boolean;
  policy: LeavePolicySummary | null;
  balance: LeaveBalance | null;
  anniversaryDate: string | null;
  /** The days the office is shut, from the oldest row shown to the end of next year. */
  holidays: string[];
}) {

  // A policy without accrual rules (no paid leave) has no balance to show.
  const hpd = policy?.accrual.hoursPerDay ?? 8;
  const days = (h: number) => formatNumber(hoursToDays(h, hpd));
  // What is still free to book: today's balance less leave already booked for
  // later this policy year, the same figure the calendar-first page shows.
  const free = balance ? Math.round((balance.remainingHours - balance.bookedHours) * 100) / 100 : 0;

  const views = [
    {
      key: "list",
      label: "List",
      content: <TimeOffPanel may={may} rows={rows} autoApprove={autoApprove} holidays={holidays} />,
    },
    {
      key: "calendar",
      label: "Calendar",
      content: (
        <div className="admin-card admin-section-card">
          <h2 className="admin-card-title">Your leave</h2>
          <TimeOffCalendar
            entries={rows.map(
              (r): CalendarEntry => ({
                id: r.id,
                // Own leave only on this page, so the chip labels the
                // leave type instead of repeating the actor's name.
                name: null,
                leaveType: r.leaveType,
                status: r.status,
                startDate: r.startDate,
                endDate: r.endDate,
                isHalfDay: r.isHalfDay,
              }),
            )}
          />
        </div>
      ),
    },
  ];
  if (policy) {
    views.push({
      key: "policy",
      label: "Policy",
      content: <PolicyCard policy={policy} balance={balance} anniversaryDate={anniversaryDate} title={`Your policy: ${policy.name}`} />,
    });
  }

  return (
    <>
      <PageHead eyebrow="My Work" title="Time Off" sub={policy ? `Policy: ${policy.name}` : "Request and track your leave."} />

      {balance && (
        <div className="admin-kpi-grid u-mb-5">
          <MetricCard
            label="Accrued this year"
            value={days(balance.openingHours + balance.accruedPolicyYearHours)}
            sub={`${days(balance.openingHours)} carried in + ${days(balance.accruedPolicyYearHours)} accrued · ${formatNumber(balance.openingHours + balance.accruedPolicyYearHours)} h`}
          />
          <MetricCard
            label="Used this year"
            value={days(balance.usedPolicyYearHours)}
            sub={`days taken · ${formatNumber(balance.usedPolicyYearHours)} h`}
          />
          <MetricCard
            label="Available balance"
            value={days(free)}
            sub={
              free < 0
                ? "taken or booked in advance of accrual"
                : [
                    "days left",
                    balance.bookedHours > 0 ? `${days(balance.bookedHours)} booked ahead` : null,
                    balance.pendingHours > 0 ? `${days(balance.pendingHours)} more awaiting approval` : `${formatNumber(free)} h`,
                  ].filter(Boolean).join(" · ")
            }
          />
        </div>
      )}

      <ViewToggle views={views} />
    </>
  );
}
