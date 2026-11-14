// The Admin Home's week strip (AH.4): the next fortnight's company dates as
// days, not as lists. AH.2 drew them as four grouped lists (away, probation,
// new joiners, holiday) in the right column; read in a row of days they say
// when, which a list of badges made the reader work out.
//
// Same rule as the rest of the Home: company events only, never a figure about
// another person. A failed read says so instead of drawing an empty fortnight.
import { addDays, diffDays } from "@/kernel/config/dates";
import type { AdminHomeInput, AdminHomeModel, WeekDay } from "./admin-home-types";
import { dayLabel } from "./admin-home-dates";

const WINDOW_DAYS = 14;
const MAX_DAYS = 7;
const NEW_JOINER_DAYS = 30;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function homeWeek(input: AdminHomeInput): AdminHomeModel["week"] {
  const { today } = input;
  const t = input.team;
  const parts = t ? [t.away, t.probation, t.holidays, t.applications].filter((x) => x !== undefined) : [];
  if (parts.some((p) => !p.ok)) return { failed: true };

  const last = addDays(today, WINDOW_DAYS - 1);
  const inWindow = (d: string) => d >= today && d <= last;
  const events = new Map<string, { key: string; text: string }[]>();
  const add = (date: string, key: string, text: string) => {
    if (!inWindow(date)) return;
    events.set(date, [...(events.get(date) ?? []), { key, text }]);
  };

  if (t?.probation?.ok)
    for (const p of t.probation.value) {
      if (p.endsOn) add(p.endsOn, `prob:${p.teamMemberId}`, `${p.name}’s probation ends`);
      if (p.startDate) add(p.startDate, `start:${p.teamMemberId}`, `${p.name} starts`);
    }
  if (t?.away?.ok)
    for (const a of t.away.value)
      add(a.start < today ? today : a.start, `away:${a.personId}:${a.start}`, a.end > a.start ? `${a.name} away to ${dayLabel(a.end)}` : `${a.name} away`);
  if (t?.holidays?.ok) for (const h of t.holidays.value) add(h.date, `hol:${h.date}`, h.closed ? `${h.name}, office closed` : h.name);

  const days: WeekDay[] = [...events.keys()]
    .sort()
    .slice(0, MAX_DAYS)
    .map((date) => ({ date, label: date === today ? "Today" : dayLabel(date), today: date === today, events: events.get(date)! }));

  // Counts that are a way into a page rather than a date.
  const links: { label: string; href: string | null }[] = [];
  if (t?.probation?.ok) {
    const fresh = t.probation.value.filter((p) => p.startDate && p.startDate <= today && diffDays(p.startDate, today) < NEW_JOINER_DAYS).length;
    if (fresh > 0) links.push({ label: `${plural(fresh, "new joiner")} in their first month`, href: t.probationHref ?? t.href });
  }
  if (t?.applications?.ok && t.applications.value.count > 0)
    links.push({ label: `${plural(t.applications.value.count, "application")} in review`, href: t.applications.value.href });
  if (input.promises) {
    if (!input.promises.ok) links.push({ label: "Couldn’t load your 1-1 promises", href: null });
    else {
      const { rows, href } = input.promises.value;
      const late = rows.filter((p) => !p.blocked && p.dueOn !== null && p.dueOn < today).length;
      if (late > 0) links.push({ label: `1-1 promises: ${late} past ${late === 1 ? "its" : "their"} date`, href });
      else if (rows.length > 0) links.push({ label: `1-1 promises: ${rows.length} open`, href });
    }
  }

  if (days.length === 0 && links.length === 0) return null;
  return { failed: false, href: t?.href ?? null, days, links };
}
