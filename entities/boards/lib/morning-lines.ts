// Overdue cards for the Operations morning list (the Lark notifications plan).
// Built here because boards owns tasks.

import { companyOs } from "@/kernel/data/supabase";
import { byOwner, firstNames, plural, rows, type ListLine } from "@/kernel/messaging/office-list";

export async function overdueCardMorningLines(today: string): Promise<ListLine[]> {
  const cards = await rows("cards", companyOs.from("tasks").select("assignee_id").is("archived_at", null).is("completed_at", null).lt("due_date", today).limit(5000));
  if (cards.length === 0) return [];
  const names = await firstNames(cards.map((c) => c.assignee_id as string));
  const counts = [...byOwner(cards, (c) => c.assignee_id as string | null, names)].map(([who, g]) => ({ who, n: g.length })).sort((a, b) => b.n - a.n);
  const top = counts.slice(0, 4).map((c) => `${c.who} ${c.n}`).join(", ");
  const rest = counts.length > 4 ? `, and ${counts.length - 4} more people` : "";
  return [{ who: null, text: `${plural(cards.length, "card")} past due: ${top}${rest}. Each owner re-dates or closes theirs.`, href: "/admin/edges/workboard" }];
}
