import type { BadgeTone } from "@/kernel/ui/Badge";

// Leave types are constrained at the DB (company_os.time_off_leave_type_check).
// Keep this list in sync with that constraint.
export const LEAVE_TYPES = [
  "vacation",
  "sick",
  "personal",
  "parental",
  "bereavement",
  "unpaid",
  "public_holiday",
  "other",
] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  vacation: "Vacation",
  sick: "Sick",
  personal: "Personal",
  parental: "Parental",
  bereavement: "Bereavement",
  unpaid: "Unpaid",
  public_holiday: "Public holiday",
  other: "Other",
};

export function statusTone(status: string): BadgeTone {
  switch (status) {
    case "approved":
    case "taken":
      return "ok";
    case "rejected":
      return "err";
    case "requested":
      return "warn";
    case "cancelled":
      return "neutral";
    default:
      return "neutral";
  }
}

/** A set of ISO `yyyy-mm-dd` days nobody is expected to work. */
export type HolidayDates = ReadonlySet<string> | readonly string[] | null | undefined;

// The loop below builds each day in *local* time, because the range endpoints
// are parsed as local midnight. Reading a day back with toISOString() would
// shift it by the offset — in Saigon (UTC+7) every date would come back as the
// day before, and every holiday lookup would miss.
const isoLocal = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Working days between two ISO dates (inclusive), excluding weekends and any
// day in `holidays`. A half-day request counts 0.5 — unless that very day is a
// holiday, when the office was shut and nothing is deducted.
//
// `holidays` is passed in rather than read here because this function is
// exported through client.ts and runs inside three client components to preview
// a request as its dates are picked: it has to stay pure and synchronous. The
// server loads the calendar (lib/holidays.ts) and hands it down. Omitting the
// argument keeps the old weekends-only behaviour, so a call site that has no
// calendar to give is unchanged rather than silently wrong.
export function countWorkingDays(
  startDate: string,
  endDate: string,
  isHalfDay: boolean,
  holidays?: HolidayDates,
): number {
  const off: ReadonlySet<string> = holidays instanceof Set ? holidays : new Set(holidays ?? []);
  if (isHalfDay) return off.has(startDate) ? 0 : 0.5;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  let days = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    if (off.has(isoLocal(d))) continue;
    days += 1;
  }
  return days;
}

export function formatDays(days: number): string {
  return days === 1 ? "1 day" : `${days} days`;
}

// Format a synced leave-balance number for the People table: round to at most
// one decimal and drop a trailing ".0". 12 → "12", 10.15 → "10.2", 13.32 → "13.3".
export function formatLeaveBalance(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "0";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
