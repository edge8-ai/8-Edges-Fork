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
import { NAME_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import { readOr } from "@/kernel/data/read";

export type OutToday = { personId: string; name: string; avatarUrl: string | null; backOn: string };

type OutRow = {
  end_date: string;
  team_members: { person_id: string; people: (NamedPerson & { avatar_url: string | null }) | null } | null;
};

/** The day after `iso`, skipping Saturday and Sunday: the first working day back. */
export function nextWorkingDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

/** Approved leave covering `today`, one row per person, soonest back first. */
export async function whoIsOut(today: string): Promise<OutToday[] | null> {
  const res = await companyOs
    .from("time_off")
    .select(`end_date, team_members!team_member_id(person_id, people!person_id(${NAME_COLUMNS}, avatar_url))`)
    .eq("status", "approved")
    .lte("start_date", today)
    .gte("end_date", today)
    .order("end_date");
  const rows = readOr(res, "who is out today", null) as OutRow[] | null;
  if (rows === null) return null;
  const seen = new Map<string, OutToday>();
  for (const r of rows) {
    const tm = r.team_members;
    if (!tm?.people || seen.has(tm.person_id)) continue;
    seen.set(tm.person_id, {
      personId: tm.person_id,
      name: personName(tm.people, "A teammate"),
      avatarUrl: tm.people.avatar_url,
      backOn: nextWorkingDay(r.end_date),
    });
  }
  return [...seen.values()];
}

export type Holiday = { date: string; name: string; closed: boolean };

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
