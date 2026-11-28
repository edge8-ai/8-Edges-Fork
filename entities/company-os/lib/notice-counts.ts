import { companyOs } from "@/kernel/data/supabase";
import { addDays, saigonToday } from "@/kernel/config/dates";

// What Edge8 OS sent to Lark in the last 30 days, per destination: delivered,
// held by the one-message-per-office rule, or failed. Read from the message
// log (company_os.interactions, kind lark), which records all three.

export type NoticeCount = { id: string; destination: string; sent: number; held: number; failed: number; topSubjects: string };

type LogRow = { subject: string | null; metadata: { chat?: string; to?: string; held?: string; failed?: string } | null };

const CHAT_LABEL: Record<string, string> = {
  ops: "Operations chat",
  revenue: "Revenue chat",
  talent: "Talent chat",
  product: "Product chat",
  eo: "EO chat",
  coaching: "Learner chat",
};

/** The subject without its numbers and dates, so one kind of message groups as one. */
export function subjectKind(subject: string | null): string {
  return (subject ?? "Untitled").replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "").replace(/\d+/g, "#").replace(/\s+/g, " ").trim().slice(0, 60);
}

export async function noticeCounts(days = 30): Promise<NoticeCount[]> {
  const since = `${addDays(saigonToday(), -days)}T00:00:00Z`;
  const { data, error } = await companyOs
    .from("interactions").select("subject, metadata").eq("kind", "lark").gte("occurred_at", since).limit(10000);
  if (error) throw new Error(`[notice-counts] ${error.message}`);
  const groups = new Map<string, { sent: number; held: number; failed: number; subjects: Map<string, number> }>();
  for (const row of (data ?? []) as LogRow[]) {
    const m = row.metadata ?? {};
    const destination = m.chat ? (CHAT_LABEL[m.chat] ?? `${m.chat} chat`) : "Direct messages";
    const g = groups.get(destination) ?? { sent: 0, held: 0, failed: 0, subjects: new Map() };
    if (m.held) g.held += 1;
    else if (m.failed) g.failed += 1;
    else g.sent += 1;
    const kind = subjectKind(row.subject);
    g.subjects.set(kind, (g.subjects.get(kind) ?? 0) + 1);
    groups.set(destination, g);
  }
  return [...groups]
    .map(([destination, g]) => ({
      id: destination,
      destination,
      sent: g.sent,
      held: g.held,
      failed: g.failed,
      topSubjects: [...g.subjects].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s, n]) => `${s} (${n})`).join(", "),
    }))
    .sort((a, b) => b.sent + b.held + b.failed - (a.sent + a.held + a.failed));
}
