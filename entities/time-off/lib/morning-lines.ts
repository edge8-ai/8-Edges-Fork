// Time off for the Operations morning list (the Lark notifications plan):
// requests waiting on their approver, and who is out this week. Built here
// because time-off owns time_off.

import { companyOs } from "@/kernel/data/supabase";
import { addDays } from "@/kernel/config/dates";
import { byOwner, firstNames, plural, rows, shortDate, type ListLine } from "@/kernel/messaging/office-list";

export async function leaveApprovalMorningLines(): Promise<ListLine[]> {
  const leave = await rows("time off", companyOs.from("time_off").select("start_date, tm:team_members(manager_id)").eq("status", "pending").order("start_date"));
  const managerOf = (r: Record<string, unknown>) => (r.tm as { manager_id?: string | null } | null)?.manager_id ?? null;
  const names = await firstNames(leave.map(managerOf));
  return [...byOwner(leave, managerOf, names)].map(([who, group]) => ({
    who,
    text: `${plural(group.length, "time-off request")} to approve, the first from ${shortDate(group[0].start_date as string)}.`,
    href: "/admin/operations/time-off/requests",
  }));
}

export async function outThisWeekMorningLines(today: string): Promise<ListLine[]> {
  const out = await rows(
    "out",
    companyOs.from("time_off").select("start_date, end_date, tm:team_members(person_id)").eq("status", "approved")
      .lte("start_date", addDays(today, 7)).gte("end_date", today).order("start_date"),
  );
  if (out.length === 0) return [];
  const personOf = (r: Record<string, unknown>) => (r.tm as { person_id?: string | null } | null)?.person_id ?? null;
  const names = await firstNames(out.map(personOf));
  const when = (r: Record<string, unknown>) => (r.start_date === r.end_date ? shortDate(r.start_date as string) : `${shortDate(r.start_date as string)} to ${shortDate(r.end_date as string)}`);
  const byPerson = new Map<string, string[]>();
  for (const r of out) {
    const who = names.get(personOf(r) ?? "") ?? "someone";
    byPerson.set(who, [...(byPerson.get(who) ?? []), when(r)]);
  }
  return [{ who: null, text: `${[...byPerson].map(([who, days]) => `${who} ${days.join(" and ")}`).join("; ")}.`, href: "/admin/operations/time-off" }];
}
