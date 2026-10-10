import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The holiday seed is data, and the one way to get it quietly wrong is to put a
// day on a weekend. countWorkingDays already skips Saturdays and Sundays, so
// such a row is inert: it looks like the holiday is handled while the day the
// office actually shut — the compensatory weekday the decree names — is still
// charged as leave. That is invisible until somebody's balance is short.
//
// So this reads the seed and asserts every date is a weekday. Whoever adds next
// year's Tết will be told immediately if they entered the lunar date instead of
// the day off.
const SEED = path.join(
  process.cwd(),
  "supabase/migrations/20260918150000_seed_vietnam_statutory_holidays.sql",
);

function seededDates(): { date: string; name: string }[] {
  const sql = fs.readFileSync(SEED, "utf8");
  const rows: { date: string; name: string }[] = [];
  // Value rows look like: ('2026-02-16', 'Tết Nguyên Đán', 'VN', true),
  for (const m of sql.matchAll(/\('(\d{4}-\d{2}-\d{2})',\s*'((?:[^']|'')*)'/g)) {
    rows.push({ date: m[1], name: m[2].replace(/''/g, "'") });
  }
  return rows;
}

describe("the Vietnam statutory holiday seed", () => {
  const rows = seededDates();

  it("parses every value row", () => {
    expect(rows.length).toBe(29);
  });

  it("puts no holiday on a weekend, where it would be silently inert", () => {
    const onWeekend = rows.filter(({ date }) => {
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
      return dow === 0 || dow === 6;
    });
    expect(onWeekend).toEqual([]);
  });

  it("names every day, because the unique key is (date, name)", () => {
    expect(rows.filter((r) => !r.name.trim())).toEqual([]);
  });

  it("has no duplicate (date, name) pair, which the insert would drop in silence", () => {
    const keys = rows.map((r) => `${r.date}|${r.name}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("covers the whole span of the leave record, which starts in July 2024", () => {
    const dates = rows.map((r) => r.date).sort();
    expect(dates.at(0)! <= "2024-09-30").toBe(true);
    // Far enough ahead that a request booked today lands inside the calendar.
    expect(dates.at(-1)! >= "2027-01-01").toBe(true);
  });

  it("gives Tết five days in each year it covers", () => {
    for (const year of ["2025", "2026"]) {
      const tet = rows.filter((r) => r.date.startsWith(year) && r.name.startsWith("Tết"));
      expect(tet, `Tết ${year}`).toHaveLength(5);
    }
  });
});
