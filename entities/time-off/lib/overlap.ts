// Does a new leave request collide with one this person already has? A request
// is live unless it was cancelled or rejected; two live rows over the same days
// double-deduct the balance and show a contradiction on the calendar (found by
// the time-off sweep). Both submit paths — the member's own and the admin's —
// ask this before inserting. An overlap on the same day counts; the admin edits
// the existing row instead of adding another.
import { selectTimeOff } from "./reads";

export async function findOverlappingTimeOff(
  teamMemberId: string,
  startDate: string,
  endDate: string,
): Promise<{ ok: true; overlap: { start_date: string; end_date: string; status: string } | null } | { ok: false; error: string }> {
  const { data, error } = await selectTimeOff("start_date, end_date, status")
    .eq("team_member_id", teamMemberId)
    .not("status", "in", "(cancelled,rejected)")
    .lte("start_date", endDate)
    .gte("end_date", startDate)
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, overlap: (data as { start_date: string; end_date: string; status: string } | null) ?? null };
}

export function overlapMessage(o: { start_date: string; end_date: string; status: string }): string {
  return `This overlaps a ${o.status} request from ${o.start_date} to ${o.end_date}. Edit that one instead of adding another.`;
}
