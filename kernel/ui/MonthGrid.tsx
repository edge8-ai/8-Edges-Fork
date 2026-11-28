"use client";

import { useState, type ReactNode } from "react";
import { shiftMonth, type Month } from "@/kernel/config/dates";

// A month grid, and nothing else: the prev/today/next head, the Monday-first
// cells with the weekend shaded and today marked, and whatever the caller
// draws inside a day. It knows no entry type, so it belongs in the kernel and
// every surface that shows a month can share one set of mechanics.
//
// Extracted from entities/time-off/ui/TimeOffCalendar.tsx for W.28, which
// needed the same grid for the Workboard's due dates. That file had been
// copied once already — the marketing calendar says so in its own header — and
// a third copy is how three screens drift apart (CLAUDE.md rule 3).

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const pad2 = (n: number) => String(n).padStart(2, "0");
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export function MonthGrid({
  renderDay,
  legend,
  dayClassName,
  onDayClick,
  selectedIso,
  dayLabel,
  today,
  toolbar,
}: {
  /** What this day holds. The iso is YYYY-MM-DD; return null for an empty day. */
  renderDay: (iso: string) => ReactNode;
  /** The key under the grid, if the caller's chips need one. */
  legend?: ReactNode;
  /** An extra class for one day, for a caller that marks days of its own. */
  dayClassName?: (iso: string) => string | undefined;
  /**
   * Makes every day a button that reports its iso, for a caller that does
   * something with a picked day (TH.6: the employee's Time Off day panel).
   * Without it the days stay plain cells, as every other caller draws them.
   */
  onDayClick?: (iso: string) => void;
  /** The picked day, marked and announced as pressed. */
  selectedIso?: string | null;
  /** The button's accessible name for a day, when the caller draws more than the date. */
  dayLabel?: (iso: string) => string;
  /** Today as the caller keeps it (the company's day), when it is not the browser's. */
  today?: string;
  /** Controls drawn in the head beside the month, right of the navigation. */
  toolbar?: ReactNode;
}) {
  const now = today ? new Date(`${today}T00:00:00`) : new Date();
  const [month, setMonth] = useState<Month>({ y: now.getFullYear(), m: now.getMonth() });
  const todayIso = today ?? isoDay(now);

  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  // Monday-first grid offset for the 1st of the month.
  const leading = (new Date(month.y, month.m, 1).getDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month.y}-${pad2(month.m + 1)}-${pad2(i + 1)}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div className="admin-cal-head">
        <div className="admin-cal-month">
          {MONTHS[month.m]} {month.y}
        </div>
        <div className="admin-cal-nav">
          <button type="button" className="admin-btn admin-btn--sm" aria-label="Previous month" onClick={() => setMonth((v) => shiftMonth(v, -1))}>
            ←
          </button>
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => setMonth({ y: now.getFullYear(), m: now.getMonth() })}>
            Today
          </button>
          <button type="button" className="admin-btn admin-btn--sm" aria-label="Next month" onClick={() => setMonth((v) => shiftMonth(v, 1))}>
            →
          </button>
        </div>
        {toolbar}
      </div>

      <div className="admin-cal-scroll">
        <div className="admin-cal-grid">
          {DOW.map((d) => (
            <div key={d} className="admin-cal-dow">
              {d}
            </div>
          ))}
          {cells.map((iso, i) => {
            if (iso === null) return <div key={`blank-${i}`} className="admin-cal-day is-blank" />;
            const dow = i % 7; // Monday-first: 5/6 are the weekend
            const extra = dayClassName?.(iso);
            const cls = `admin-cal-day${dow >= 5 ? " is-weekend" : ""}${iso === todayIso ? " is-today" : ""}${iso === selectedIso ? " is-selected" : ""}${extra ? ` ${extra}` : ""}`;
            if (onDayClick) {
              return (
                <button
                  key={iso}
                  type="button"
                  className={cls}
                  aria-pressed={iso === selectedIso}
                  aria-label={dayLabel?.(iso)}
                  onClick={() => onDayClick(iso)}
                >
                  <span className="admin-cal-date">{Number(iso.slice(8))}</span>
                  {renderDay(iso)}
                </button>
              );
            }
            return (
              <div key={iso} className={cls}>
                <div className="admin-cal-date">{Number(iso.slice(8))}</div>
                {renderDay(iso)}
              </div>
            );
          })}
        </div>
      </div>

      {legend && <div className="admin-cal-legend">{legend}</div>}
    </div>
  );
}
