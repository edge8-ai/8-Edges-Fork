// The sales lines of the Revenue morning list (the Lark notifications plan,
// 2026-11-18): leads to answer and deals whose next step is due. Built here
// because crm owns lead and deals; company-os composes the list.

import { companyOs } from "@/kernel/data/supabase";
import { NO_OWNER, byOwner, firstNames, plural, rows, shortDate, type ListLine } from "@/kernel/messaging/office-list";

export async function salesMorningLines(today: string): Promise<ListLine[]> {
  const [leads, deals] = await Promise.all([
    rows("leads", companyOs.from("lead").select("owner_id, sla_due_at, created_at").eq("status", "new").order("created_at", { ascending: false })),
    rows(
      "deals",
      companyOs.from("deals").select("title, owner_id, next_step_date").eq("status", "open").is("archived_at", null)
        .lte("next_step_date", today).order("next_step_date", { ascending: false }),
    ),
  ]);
  const names = await firstNames([...leads.map((l) => l.owner_id as string), ...deals.map((d) => d.owner_id as string)]);
  const lines: ListLine[] = [];
  const now = new Date().toISOString();

  for (const [who, group] of byOwner(leads, (l) => l.owner_id as string | null, names)) {
    const late = group.filter((l) => typeof l.sla_due_at === "string" && l.sla_due_at < now).length;
    const ask = who === NO_OWNER ? "Assign an owner or reply." : "Reply today.";
    const lateText = late > 0 ? `, ${late} past the reply deadline` : "";
    lines.push({ who, text: `${plural(group.length, "new lead")} to answer${lateText}. Newest came in ${shortDate(group[0].created_at as string)}. ${ask}`, href: "/admin/revenue/leads" });
  }

  for (const [who, group] of byOwner(deals, (d) => d.owner_id as string | null, names)) {
    const dueToday = group.filter((d) => d.next_step_date === today);
    const overdue = group.filter((d) => d.next_step_date !== today);
    if (dueToday.length > 0) lines.push({ who, text: `next step due today on ${dueToday.map((d) => d.title).join(", ")}.`, href: "/admin/revenue/deals" });
    if (overdue.length > 0) {
      const named = overdue.slice(0, 3).map((d) => `${d.title} (${shortDate(d.next_step_date as string)})`).join(", ");
      const more = overdue.length > 3 ? `, and ${overdue.length - 3} more` : "";
      lines.push({ who, text: `overdue next steps on ${named}${more}. Do them or give each a new date.`, href: "/admin/revenue/pipeline" });
    }
  }
  return lines;
}
