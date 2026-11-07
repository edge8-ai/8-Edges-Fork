// Who is away today, and the company's next days off, for the team Home
// (TH.1.6). Two small reads the Home's rail draws and nothing else needs.
//
// Who is out shows the fact of an absence and when the person is back, never
// its type or reason: a sick day is nobody's business on a home page, and
// leave_type is not even selected here, so no later edit can leak it.
//
// A failed read returns null, not an empty list. "Nobody is out" is a claim the
// rail would print, and a database hiccup must not make it (Rule 2, A.12); the
// Home hides the card instead.
import { companyOs } from "@/kernel/data/supabase";
import { NAME_ONLY_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import { CURRENT_TEAM_STATUSES } from "@/kernel/identity/team-statuses";
import { readOr } from "@/kernel/data/read";

export type OutToday = { personId: string; name: string; avatarUrl: string | null; backOn: string };

type OutRow = {
  end_date: string;
  team_members: { person_id: string; status: string | null; people: (NamedPerson & { avatar_url: string | null }) | null } | null;
};

// Who counts as a teammate on either read: someone on the team now (active, on
// leave or working out notice). A leave left on a person who has since gone
// never puts a leaver on the Home rail or a colleague's calendar.
const ON_TEAM = new Set<string>(CURRENT_TEAM_STATUSES);

/** The day after `iso`, skipping Saturday and Sunday: the first working day back. */
export function nextWorkingDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

/**
 * Approved leave covering `today`, one row per person, soonest back first.
 * The name columns leave out email (TH.7, from the TH.6 boundary review), so a
 * colleague with no name on record reads "A teammate" rather than their address.
 */
export async function whoIsOut(today: string): Promise<OutToday[] | null> {
  const res = await companyOs
    .from("time_off")
    .select(`end_date, team_members!team_member_id(person_id, status, people!person_id(${NAME_ONLY_COLUMNS}, avatar_url))`)
    .eq("status", "approved")
    .lte("start_date", today)
    .gte("end_date", today)
    .order("end_date");
  const rows = readOr(res, "who is out today", null) as OutRow[] | null;
  if (rows === null) return null;
  const seen = new Map<string, OutToday>();
  for (const r of rows) {
    const tm = r.team_members;
    if (!tm?.people || !tm.status || !ON_TEAM.has(tm.status) || seen.has(tm.person_id)) continue;
    seen.set(tm.person_id, {
      personId: tm.person_id,
      name: personName(tm.people, "A teammate"),
      avatarUrl: tm.people.avatar_url,
      backOn: nextWorkingDay(r.end_date),
    });
  }
  return [...seen.values()];
}

export type OutSpan = { personId: string; name: string; start: string; end: string };

/**
 * Approved leave overlapping `from`..`to`, for the employee's Time Off calendar
 * (TH.6): who is away on which days, so a request can be planned around them.
 * The same rule as `whoIsOut`: the fact of an absence and its dates, never its
 * type or reason, and leave_type is not selected so no edit can leak it.
 *
 * Two more rules from its boundary review (PR #2218). The name columns leave
 * out email, so a colleague with no name on record reads "A teammate" rather
 * than their address. And only people on the team now count: a future leave
 * left on someone who has since gone does not put a leaver on a colleague's
 * planning calendar.
 */
export async function whoIsOutBetween(from: string, to: string): Promise<OutSpan[] | null> {
  const res = await companyOs
    .from("time_off")
    .select(`start_date, end_date, team_members!team_member_id(person_id, status, people!person_id(${NAME_ONLY_COLUMNS}))`)
    .eq("status", "approved")
    .lte("start_date", to)
    .gte("end_date", from)
    .order("start_date");
  type SpanRow = {
    start_date: string;
    end_date: string;
    team_members: { person_id: string; status: string | null; people: NamedPerson | null } | null;
  };
  const rows = readOr(res, "who is out between", null) as SpanRow[] | null;
  if (rows === null) return null;
  return rows.flatMap((r) => {
    const tm = r.team_members;
    if (!tm?.people || !tm.status || !ON_TEAM.has(tm.status)) return [];
    return [{ personId: tm.person_id, name: personName(tm.people, "A teammate"), start: r.start_date, end: r.end_date }];
  });
}

export type Holiday = { date: string; name: string; closed: boolean };

/** The company holidays from `from` to `to`, with their names, soonest first. */
export async function holidaysBetween(from: string, to: string): Promise<Holiday[] | null> {
  const res = await companyOs
    .from("holidays")
    .select("date, name, is_company_closure")
    .gte("date", from)
    .lte("date", to)
    .order("date");
  const rows = readOr(res, "holidays between", null) as { date: string; name: string; is_company_closure: boolean }[] | null;
  return rows === null ? null : rows.map((r) => ({ date: r.date, name: r.name, closed: r.is_company_closure }));
}

/** The next company holidays from `from`, soonest first. */
export async function upcomingHolidays(from: string, limit: number): Promise<Holiday[] | null> {
  const res = await companyOs
    .from("holidays")
    .select("date, name, is_company_closure")
    .gte("date", from)
    .order("date")
    .limit(limit);
  const rows = readOr(res, "upcoming holidays", null) as { date: string; name: string; is_company_closure: boolean }[] | null;
  return rows === null ? null : rows.map((r) => ({ date: r.date, name: r.name, closed: r.is_company_closure }));
}
