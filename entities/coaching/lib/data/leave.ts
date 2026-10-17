import { selectTimeOff } from "@/entities/time-off";
import { addDays } from "@/kernel/config/dates";
import { CLEAR_DAY_HORIZON, LEAVE_LOOKBACK, type LeaveSpan } from "../leave-window";

// What coaching knows about somebody being away (L.2).
//
// This is the entire surface of the `coaching -> time-off` edge, and it is
// deliberately one function. Coaching has no business in leave types, balances,
// approval flows or policies; it needs to answer exactly one question — "is
// this person here that day" — so that it never books a 1-1 into somebody's
// holiday and never calls a holiday a missed meeting.
//
// The read goes through time-off's door rather than naming its table, which is
// what the table-ownership gate checks and what lets time-off change its
// storage without breaking the coaching calendar.

// Only leave that is actually going to happen. A request still waiting on an
// approver is not a reason to move a 1-1: the coach would reschedule around a
// holiday the member may not get, and the member would wonder why their date
// moved. Cancelled and rejected rows are likewise not absences.
const COUNTS_AS_AWAY = ["approved", "client_approved"];

/**
 * The spans a member is away, around today.
 *
 * The window reaches BOTH ways, and that is the whole correctness of it. Ahead
 * by the scheduling horizon, because "can they make this day" looks forward.
 * Back by LEAVE_LOOKBACK, because "was this missed 1-1 actually a holiday" asks
 * about a date that has already gone — and a window that only looked forward
 * could answer that question correctly only while the holiday was still
 * running, which is never when anybody asks it.
 *
 * Still bounded rather than open-ended: a row from next year is work nobody
 * will look at.
 */
export async function getLeaveSpans(teamMemberId: string, todayISO: string): Promise<LeaveSpan[]> {
  if (!teamMemberId) return [];
  const until = addDays(todayISO, CLEAR_DAY_HORIZON);
  const since = addDays(todayISO, -LEAVE_LOOKBACK);
  const { data, error } = await selectTimeOff("start_date, end_date, status, team_member_id")
    .eq("team_member_id", teamMemberId)
    .in("status", COUNTS_AS_AWAY)
    // Any span that overlaps the window, including one that began before it or
    // ended before today.
    .lte("start_date", until)
    .gte("end_date", since);
  if (error) {
    // Logged, not thrown, and an empty result is the safe direction: the picker
    // falls back to behaving exactly as it did before this feature existed,
    // rather than refusing to schedule because time-off had a bad minute.
    console.error("[team/coaching/leave] time_off", error);
    return [];
  }
  return ((data ?? []) as { start_date: string; end_date: string }[]).map((r) => ({
    startDate: r.start_date,
    endDate: r.end_date,
  }));
}

/**
 * The same window, for several members at once.
 *
 * The roster asks this about everybody on it, and N round trips for a table
 * this small is the kind of thing that is invisible at three people and
 * embarrassing at thirty.
 */
export async function getLeaveSpansByMember(
  teamMemberIds: string[],
  todayISO: string,
): Promise<Map<string, LeaveSpan[]>> {
  const out = new Map<string, LeaveSpan[]>();
  const ids = [...new Set(teamMemberIds.filter(Boolean))];
  if (ids.length === 0) return out;
  const { data, error } = await selectTimeOff("start_date, end_date, status, team_member_id")
    .in("team_member_id", ids)
    .in("status", COUNTS_AS_AWAY)
    .lte("start_date", addDays(todayISO, CLEAR_DAY_HORIZON))
    .gte("end_date", addDays(todayISO, -LEAVE_LOOKBACK));
  if (error) {
    // Same safe direction as the single read: an empty map means the roster
    // behaves exactly as it did before this feature existed.
    console.error("[team/coaching/leave] time_off roster", error);
    return out;
  }
  for (const r of (data ?? []) as { start_date: string; end_date: string; team_member_id: string }[]) {
    const arr = out.get(r.team_member_id) ?? [];
    arr.push({ startDate: r.start_date, endDate: r.end_date });
    out.set(r.team_member_id, arr);
  }
  return out;
}
