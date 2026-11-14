import { requirePermission } from "@/kernel/identity/access-request";
import { mayProp } from "@/kernel/identity/may-prop";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { saigonToday, shiftMonth } from "@/kernel/config/dates";
import { teamRead, getOwnApprovalPolicy } from "@/entities/team";
import { PageHead } from "@/kernel/ui/PageHead";
import { formatDate } from "@/kernel/ui/format";
import { mustRows } from "@/kernel/data/read";
import {
  LEAVE_TYPE_LABEL,
  PolicyCard,
  balanceFacts,
  daysByType,
  formatDays,
  formatNumber,
  getMemberLeave,
  holidaysBetween,
  listHolidayDates,
  outByDay,
  ownByDay,
  tracksLeaveByType,
  whoIsOutBetween,
  type LeaveType,
  type OwnLeaveRow,
} from "@/entities/time-off";
import { TimeOffHome, type LeaveRing } from "./TimeOffHome";
import { PlainTimeOff } from "./PlainTimeOff";

export const metadata = {
  title: "Time Off",
  description: "Request time off and see your balance and history.",
};

// The non-bank types the rings show when nothing else was taken this year.
const RING_DEFAULTS: LeaveType[] = ["sick", "personal", "bereavement"];

const pad2 = (n: number) => String(n).padStart(2, "0");
const monthStart = (y: number, m: number) => `${y}-${pad2(m + 1)}-01`;
const monthEnd = (y: number, m: number) => `${y}-${pad2(m + 1)}-${pad2(new Date(Date.UTC(y, m + 1, 0)).getUTCDate())}`;

// /team/time-off — own-service only (TH.6: calendar first, the balance and
// what is coming on top, a request sheet). Every read of leave rows is filtered
// to the actor's own team_member id (never a client-supplied one), matching the
// scoped-write actions in ./actions.ts. The one read that is not the actor's is
// who else is out: names and dates only, never a colleague's leave type.
export default async function TeamTimeOffPage() {
  // The page's declared permission (ADR 0013), also the atom both of its
  // actions check, handed down as `may` so their controls follow it (ADR 0014).
  const access = await requirePermission("time-off.mine");
  const actor = await requireTeamMember();

  // The calendar's window: last month to five months ahead, in the company's
  // own day, so planning sees who is away and which days the office is shut.
  const today = saigonToday();
  const now = { y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 };
  const first = shiftMonth(now, -1);
  const last = shiftMonth(now, 5);
  const from = monthStart(first.y, first.m);
  const to = monthEnd(last.y, last.m);

  const [approvalPolicy, requestsRes, leaveById, outSpans, windowHolidays] = await Promise.all([
    getOwnApprovalPolicy(actor),
    teamRead(actor, "time_off", "id, leave_type, status, start_date, end_date, is_half_day, reason, days")
      .eq("team_member_id", actor.teamMemberId)
      .order("start_date", { ascending: false })
      .limit(200),
    getMemberLeave([actor.teamMemberId]),
    whoIsOutBetween(from, to),
    holidaysBetween(from, `${Number(today.slice(0, 4)) + 1}-12-31`),
  ]);

  const toDays = (v: number | string | null): number | null => {
    if (v === null) return null;
    const n = typeof v === "string" ? Number(v) : v;
    return Number.isFinite(n) ? n : null;
  };
  // A failed read of the person's own leave throws to the error page rather
  // than drawing an empty history and a calendar with no bookings on it, which
  // would read as "you have no leave" (Rule 2, A.12).
  const rawRows = mustRows(requestsRes, "[time-off/page] time_off") as unknown as {
    id: string; leave_type: string; status: string; start_date: string; end_date: string; is_half_day: boolean; reason: string | null; days: number | string | null;
  }[];
  const rows = rawRows.map(
    (r): OwnLeaveRow => ({
      id: r.id, leaveType: r.leave_type, status: r.status, startDate: r.start_date, endDate: r.end_date,
      isHalfDay: r.is_half_day, reason: r.reason, days: toDays(r.days),
    }),
  );

  // A failed holidays read leaves the calendar without closures rather than
  // inventing open days; the request count then simply counts weekdays.
  const holidays = windowHolidays ?? [];
  const closed = new Set(holidays.filter((h) => h.closed).map((h) => h.date));
  const holidayNames = Object.fromEntries(holidays.map((h) => [h.date, h.name]));

  const leave = leaveById.get(actor.teamMemberId) ?? null;
  const policy = leave?.policy ?? null;
  const computed = leave?.balance ?? null;
  const may = mayProp(access, ["time-off.mine"]);

  // A policy that does not keep leave apart by type (a pooled PTO bank, or no
  // paid leave) gets the plain page: type chips and a ring per type would
  // describe tracking its policy does not do (TH.26).
  if (!tracksLeaveByType(policy)) {
    // The plain page counts each history row against the office calendar, so it
    // needs closures from the oldest row shown, further back than the calendar
    // window read above. It depends on the rows, so it follows that read, and
    // only this page pays for it.
    const plainHolidays = await listHolidayDates(rows.at(-1)?.startDate ?? today, `${Number(today.slice(0, 4)) + 1}-12-31`);
    return (
      <PlainTimeOff
        may={may}
        rows={rows}
        autoApprove={approvalPolicy.autoApprove}
        policy={policy}
        balance={computed}
        anniversaryDate={leave?.anniversaryDate ?? null}
        holidays={plainHolidays}
      />
    );
  }

  const hpd = policy?.accrual.hoursPerDay ?? 8;
  const facts = computed && policy ? balanceFacts(computed, hpd, policy.accrual.carryCapHours) : null;
  const bankTypes = policy?.accrual.bankLeaveTypes ?? [];
  const bankLabel = (LEAVE_TYPE_LABEL[bankTypes[0] as LeaveType] ?? "vacation").toLowerCase();

  // One ring per bank type (its balance), then the types that never draw on
  // it: the ones taken this policy year first, then the usual three.
  const taken = daysByType(rows, computed?.policyYearStart ?? null, [...closed]);
  const rings: LeaveRing[] = [];
  if (facts) {
    for (const t of bankTypes) {
      const left = facts.available;
      rings.push({
        type: t,
        label: LEAVE_TYPE_LABEL[t as LeaveType] ?? t,
        value: formatNumber(left),
        fraction: facts.earned > 0 ? Math.max(0, Math.min(1, left / facts.earned)) : 0,
        sub: [
          `${formatNumber(left)} of ${formatNumber(facts.earned)} earned left`,
          facts.next ? `+${formatNumber(facts.next.days)} on ${formatDate(facts.next.date)}` : null,
          facts.ratePerYear ? `${formatNumber(facts.ratePerYear)} a year` : null,
        ].filter(Boolean).join(" · "),
      });
    }
    const others = [
      ...Object.keys(taken).filter((t) => !bankTypes.includes(t)),
      ...RING_DEFAULTS.filter((t) => !bankTypes.includes(t)),
    ].filter((t, i, a) => a.indexOf(t) === i).slice(0, Math.max(0, 4 - rings.length));
    for (const t of others) {
      const n = taken[t] ?? 0;
      rings.push({
        type: t,
        label: LEAVE_TYPE_LABEL[t as LeaveType] ?? t,
        value: n > 0 ? formatNumber(n) : "0",
        fraction: null,
        sub: `${n > 0 ? `${formatDays(n)} taken this year` : "None taken this year"} · never uses your ${bankLabel}`,
      });
    }
  }

  return (
    <div className="to-page">
      <PageHead
        eyebrow="My Work"
        title="Time Off"
        sub={policy ? `Policy: ${policy.name}` : "Request and track your leave."}
      />
      <TimeOffHome
        may={may}
        today={today}
        windowFrom={from}
        windowTo={to}
        facts={facts}
        rings={rings}
        holidays={holidayNames}
        closedDates={[...closed]}
        outs={outSpans ? outByDay(outSpans, from, to, closed, actor.personId) : null}
        own={ownByDay(rows, closed)}
        rows={rows}
        autoApprove={approvalPolicy.autoApprove}
        bankTypes={bankTypes}
        policyView={
          policy ? (
            <PolicyCard policy={policy} balance={computed} anniversaryDate={leave?.anniversaryDate ?? null} title={`Your policy: ${policy.name}`} />
          ) : null
        }
      />
    </div>
  );
}
