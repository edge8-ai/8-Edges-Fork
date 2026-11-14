// The calendar arithmetic behind the balance walk, on ISO `YYYY-MM-DD`
// strings. Split from balance.ts so the walk stays under the file-size cap;
// the walk re-exports the two callers use (serviceYearOn, policyYearFor).
import type { YearBasis } from "./balance";

// Date helpers on ISO `YYYY-MM-DD` strings. Everything is done in UTC so a
// server in any zone gets the same calendar day; the inputs are dates, not
// instants, and the arithmetic never crosses a day boundary.
export function parse(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}
export function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function lastDayOfMonth(year: number, monthIndex: number): string {
  return iso(new Date(Date.UTC(year, monthIndex + 1, 0)));
}
export function addYears(isoDate: string, years: number): string {
  const d = parse(isoDate);
  const target = new Date(Date.UTC(d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate()));
  // 29 February rolls to 1 March in a non-leap year; that is the right day for
  // an anniversary and matches what a person would expect.
  return iso(target);
}

// Service year N covers the N-th twelve months after the anniversary date:
// year 1 is the day probation ended up to the day before the first anniversary.
export function serviceYearOn(anniversaryDate: string, onDate: string): number {
  if (onDate < anniversaryDate) return 0;
  let year = 1;
  while (addYears(anniversaryDate, year) <= onDate) year += 1;
  return year;
}

export function dayBefore(isoDate: string): string {
  const d = parse(isoDate);
  d.setUTCDate(d.getUTCDate() - 1);
  return iso(d);
}

// The policy year a date falls in: service year n and its first and last day
// on an anniversary policy, the calendar year on a calendar one. Null for a date
// before the anniversary date on an anniversary policy.
export function policyYearFor(
  yearBasis: YearBasis,
  anniversaryDate: string,
  onDate: string,
): { year: number; start: string; end: string } | null {
  if (yearBasis === "calendar") {
    const y = Number(onDate.slice(0, 4));
    return { year: y, start: `${y}-01-01`, end: `${y}-12-31` };
  }
  const n = serviceYearOn(anniversaryDate, onDate);
  if (n === 0) return null;
  return { year: n, start: addYears(anniversaryDate, n - 1), end: dayBefore(addYears(anniversaryDate, n)) };
}
