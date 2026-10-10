// The company's non-working calendar: the days the office is shut, so leave
// spanning them does not deduct from anybody's balance.
//
// `holidays` was declared as team's table and read by nothing. It moved here
// with T.1 because time-off's arithmetic is the only thing that depends on it,
// and because the move was forced rather than chosen: `team` requires
// `time-off`, so time-off sits below team in the entity DAG and could never
// import team's door to reach the table. The entity whose maths needs a table
// owns it.
import { companyOs } from "@/kernel/data/supabase";

type HolidayRow = { date: string };

// Every holiday day in [from, to], as ISO `yyyy-mm-dd`.
//
// A read failure returns an empty calendar rather than throwing: a leave screen
// that renders with weekends-only counts is worse than correct, but a leave
// screen that 500s helps nobody. The error is logged so the gap is visible.
//
// There is no country filter. The company runs one public-holiday calendar
// today, and a second one would have to be chosen per person rather than per
// query — that is a policy decision, not something this loader should guess.
export async function listHolidayDates(from: string, to: string): Promise<string[]> {
  if (!from || !to || to < from) return [];
  const { data, error } = await companyOs
    .from("holidays")
    .select("date")
    .gte("date", from)
    .lte("date", to)
    .order("date");
  if (error) {
    console.error("[time-off] holidays read failed:", error.message);
    return [];
  }
  return ((data ?? []) as unknown as HolidayRow[]).map((r) => r.date);
}

/** The narrowest range covering every given day, or null when there are none. */
export function rangeCovering(days: readonly string[]): { from: string; to: string } | null {
  let from: string | null = null;
  let to: string | null = null;
  for (const d of days) {
    if (!d) continue;
    if (from === null || d < from) from = d;
    if (to === null || d > to) to = d;
  }
  return from !== null && to !== null ? { from, to } : null;
}

// The calendar covering a set of leave dates, in one query rather than one per
// row: a balance walk needs every holiday between the oldest request and the
// newest, and that is a single span. Callers pass the endpoints they hold,
// whatever their row shape spells them — `flatMap(r => [r.start, r.end])`.
export async function listHolidayDatesCovering(days: readonly string[]): Promise<string[]> {
  const range = rangeCovering(days);
  return range ? listHolidayDates(range.from, range.to) : [];
}
