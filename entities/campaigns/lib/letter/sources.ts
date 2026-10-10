import { companyOs } from "@/kernel/data/supabase";
import { selectEvents } from "@/entities/retreats";
import { selectMeetings } from "@/entities/crm";
import { optionalEnv } from "@/kernel/config/env";

// Where the week comes from. Each source returns dated raw material; the
// gather step distils it into data points. Nothing here decides what is worth
// writing about. A source that is not configured (the journal) contributes
// nothing rather than failing the run.

export type SourceItem = { date: string; kind: "event" | "meeting" | "journal"; title: string; text: string };

const clip = (s: string | null | undefined, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export async function readEvents(since: string): Promise<SourceItem[]> {
  const { data, error } = await selectEvents("title, blurb, description, location, starts_at, ends_at")
    .gte("ends_at", since)
    .lte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: false })
    .limit(10);
  if (error) {
    console.error("[letter] events read failed:", error.message);
    return [];
  }
  // retreats owns events, so the read comes through its door and the row
  // shape is stated here rather than inferred from the column list.
  type EventRow = { title: string | null; blurb: string | null; description: string | null; location: string | null; starts_at: string | null };
  return ((data ?? []) as unknown as EventRow[]).map((e) => ({
    date: (e.starts_at ?? "").slice(0, 10),
    kind: "event" as const,
    title: e.title ?? "",
    text: `${e.location ? `${e.location}. ` : ""}${clip(e.blurb ?? e.description, 500)}`,
  }));
}

export async function readMeetings(since: string): Promise<SourceItem[]> {
  const { data, error } = await selectMeetings("title, started_at, summary")
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error("[letter] meetings read failed:", error.message);
    return [];
  }
  // crm owns meetings; same reason as readEvents above.
  type MeetingRow = { title: string | null; started_at: string | null; summary: string | null };
  return ((data ?? []) as unknown as MeetingRow[])
    .filter((m) => m.summary)
    .map((m) => ({ date: (m.started_at ?? "").slice(0, 10), kind: "meeting" as const, title: m.title ?? "Meeting", text: clip(m.summary, 1200) }));
}

// Dave's journal lives in Notion. NOTION_API_KEY is an internal integration
// token shared with the journal database; NOTION_JOURNAL_DATABASE_ID is that
// database. Pages edited since `since` are read, first 60 blocks each.
export async function readJournal(since: string): Promise<SourceItem[]> {
  const key = optionalEnv("NOTION_API_KEY");
  const db = optionalEnv("NOTION_JOURNAL_DATABASE_ID");
  if (!key || !db) return [];
  const headers = { Authorization: `Bearer ${key}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" };
  try {
    const q = await fetch(`https://api.notion.com/v1/databases/${db}/query`, {
      method: "POST",
      headers,
      body: JSON.stringify({ filter: { timestamp: "last_edited_time", last_edited_time: { on_or_after: since } }, sorts: [{ timestamp: "last_edited_time", direction: "descending" }], page_size: 10 }),
    });
    if (!q.ok) {
      console.error(`[letter] notion query failed: ${q.status}`);
      return [];
    }
    const pages = ((await q.json()) as { results?: { id: string; last_edited_time: string; properties?: Record<string, unknown> }[] }).results ?? [];
    const items: SourceItem[] = [];
    for (const page of pages) {
      const title = Object.values(page.properties ?? {})
        .map((p) => (p as { title?: { plain_text: string }[] }).title?.map((t) => t.plain_text).join(""))
        .find(Boolean) ?? "Journal";
      const b = await fetch(`https://api.notion.com/v1/blocks/${page.id}/children?page_size=60`, { headers });
      if (!b.ok) continue;
      const blocks = ((await b.json()) as { results?: Record<string, unknown>[] }).results ?? [];
      const text = blocks
        .map((blk) => {
          const inner = blk[blk.type as string] as { rich_text?: { plain_text: string }[] } | undefined;
          return inner?.rich_text?.map((t) => t.plain_text).join("") ?? "";
        })
        .filter(Boolean)
        .join("\n");
      items.push({ date: page.last_edited_time.slice(0, 10), kind: "journal", title, text: clip(text, 2500) });
    }
    return items;
  } catch (err) {
    console.error("[letter] notion read failed:", err instanceof Error ? err.message : String(err));
    return [];
  }
}

export async function gatherSources(days = 10): Promise<SourceItem[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [events, meetings, journal] = await Promise.all([readEvents(since), readMeetings(since), readJournal(since)]);
  return [...journal, ...events, ...meetings].sort((a, b) => b.date.localeCompare(a.date));
}
