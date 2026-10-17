// My Week's three questions (Dave, 2026-10-14): what is overdue, what is due
// this sprint, and what I promised my coach and my team. The model in
// my-week.ts still sorts every open card into exactly one bucket; this regroups
// those buckets into the three answers the page leads with, and everything
// else (in progress with no near date, new with no day, due after the sprint,
// no date) into one folded list underneath. Pure, so the regrouping is tested
// without a database.
import type { MyWeekModel, MyWeekRow } from "./my-week";

export type FocusDay = { date: string; isToday: boolean; rows: MyWeekRow[] };

export type MyWeekFocus = {
  /** Every open card past its date, started or not, the latest first. */
  overdue: MyWeekRow[];
  /** Today (due today and the blockers waiting on you), then each later day of the sprint that holds work. */
  due: FocusDay[];
  /** Everything else, folded on the page: one list per old heading, so nothing is lost. */
  rest: { doing: MyWeekRow[]; fresh: MyWeekRow[]; later: MyWeekRow[]; undated: MyWeekRow[] };
  counts: { overdue: number; due: number; rest: number };
};

export function myWeekFocus(m: MyWeekModel): MyWeekFocus {
  const late = (r: MyWeekRow) => r.lateDays > 0;
  // Started work that falls due inside the sprint is due work like any other:
  // it is listed on its day, and only started work with no near date is folded.
  const inSprint = (r: MyWeekRow) => r.due !== null && r.due >= m.today && r.due <= m.window.endsOn;

  const overdue = [...m.doing.filter(late), ...m.now.filter(late)].sort((a, b) => b.lateDays - a.lateDays);
  const doingOn = (date: string) => m.doing.filter((r) => !late(r) && r.due === date);

  const today: FocusDay = {
    date: m.today,
    isToday: true,
    rows: [...doingOn(m.today), ...m.now.filter((r) => !late(r))],
  };
  const ahead = m.days
    .filter((d) => d.date > m.today)
    .map((d) => ({ date: d.date, isToday: false, rows: [...doingOn(d.date), ...d.open] }))
    .filter((d) => d.rows.length > 0);
  const due = [today, ...ahead].filter((d) => d.rows.length > 0);

  const rest = {
    doing: m.doing.filter((r) => !late(r) && !inSprint(r)),
    fresh: m.fresh,
    later: m.later,
    undated: m.undated,
  };
  return {
    overdue,
    due,
    rest,
    counts: {
      overdue: overdue.length,
      due: due.reduce((n, d) => n + d.rows.length, 0),
      rest: rest.doing.length + rest.fresh.length + rest.later.length + rest.undated.length,
    },
  };
}
