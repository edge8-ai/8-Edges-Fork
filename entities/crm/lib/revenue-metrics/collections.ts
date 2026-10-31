import { companyOs } from "@/kernel/data/supabase";
import { insertInteractions } from "@/kernel/messaging/writes";
import { collectErrors, daysBetween, type Loaded } from "./shared";
import { CHASE_STALE_DAYS, COLLECTIONS_KIND, type ChaseChannel } from "./collections-vocab";
import type { OverdueRow } from "./billing";

// Re-exported because the card's note quotes the threshold; the channel list
// and the kind are read straight from the vocabulary module by the two files
// that need them, which keeps this server module out of the browser bundle.
export { CHASE_STALE_DAYS } from "./collections-vocab";

// The collections queue (RF-5, 2026-09-14): the overdue table, plus when each
// invoice's client was last chased and what the next step is.
//
// A chase is one `interactions` row of kind "collections" on the invoice's
// company. `interactions` is a kernel table, so it is written through
// kernel/messaging/writes and never raw. The queue shows WHEN the last chase
// happened and WHAT was agreed — never who made it. A collections queue is a
// list of invoices, not a scoreboard.

export type ChaseRow = { company_id: string | null; occurred_at: string; body: string | null; subject: string | null; metadata: unknown };

// The channel a chase was made through. It is written into `metadata.channel`,
// which is where a structured fact about an interaction belongs; `subject` is
// the same word in human-readable form, for the interaction views elsewhere
// that show a subject line. Reading metadata first and falling back keeps a row
// written before this shape landed legible.
export function channelOf(row: Pick<ChaseRow, "metadata" | "subject">): string | null {
  const meta = row.metadata as { channel?: unknown } | null | undefined;
  return typeof meta?.channel === "string" && meta.channel ? meta.channel : (row.subject ?? null);
}

export type CollectionRow = OverdueRow & {
  lastChasedAt: string | null;
  daysSinceChase: number | null;
  channel: string | null;
  nextStep: string | null;
  /** "err" when never chased, "warn" when the last chase is stale. */
  tone: "warn" | "err" | undefined;
};

export type Collections = Loaded & { rows: CollectionRow[]; neverChased: number; stale: number };

// The tone rule, in one place so the table and its note cannot disagree: an
// invoice nobody has ever chased is the worst case, a stale chase the next.
export function chaseTone(lastChasedAt: string | null, now: Date): "warn" | "err" | undefined {
  if (!lastChasedAt) return "err";
  return daysBetween(lastChasedAt, now) > CHASE_STALE_DAYS ? "warn" : undefined;
}

export function aggregateCollections(overdue: OverdueRow[], chases: ChaseRow[], now: Date, errors: string[] = []): Collections {
  // The latest chase per company; the query orders newest first, but the
  // aggregate does not rely on that — a fixture handed in any order gives the
  // same answer as the database does.
  const latest = new Map<string, ChaseRow>();
  for (const c of chases) {
    if (!c.company_id) continue;
    const cur = latest.get(c.company_id);
    if (!cur || c.occurred_at > cur.occurred_at) latest.set(c.company_id, c);
  }
  const rows: CollectionRow[] = overdue.map((o) => {
    const companyId = o.companyId;
    const chase = companyId ? (latest.get(companyId) ?? null) : null;
    return {
      ...o,
      companyId,
      lastChasedAt: chase?.occurred_at ?? null,
      daysSinceChase: chase ? daysBetween(chase.occurred_at, now) : null,
      channel: chase ? channelOf(chase) : null,
      nextStep: chase?.body ?? null,
      tone: chaseTone(chase?.occurred_at ?? null, now),
    };
  });
  return {
    errors,
    rows,
    neverChased: rows.filter((r) => r.lastChasedAt === null).length,
    stale: rows.filter((r) => r.tone === "warn").length,
  };
}

export async function loadCollections(overdue: OverdueRow[], now = new Date()): Promise<Collections> {
  const companyIds = [...new Set(overdue.map((o) => o.companyId).filter(Boolean) as string[])];
  if (companyIds.length === 0) return aggregateCollections(overdue, [], now);
  const res = await companyOs
    .from("interactions")
    .select("company_id, occurred_at, body, subject, metadata")
    .eq("kind", COLLECTIONS_KIND)
    .in("company_id", companyIds)
    .order("occurred_at", { ascending: false })
    .limit(2000);
  return aggregateCollections(overdue, (res.data ?? []) as ChaseRow[], now, collectErrors({ error: res.error, label: "collections log" }));
}

export type ChaseInput = { companyId: string; channel: ChaseChannel; note: string; nextDate: string | null; invoiceRef: string };

/**
 * Record one chase against a client. The caller guards; this only writes.
 * `subject` carries the channel and `body` the agreed next step, because that
 * is what the queue reads back — and neither is a person.
 */
export async function writeChase(input: ChaseInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await insertInteractions({
    company_id: input.companyId,
    kind: COLLECTIONS_KIND,
    subject: input.channel,
    body: input.nextDate ? `${input.note} (by ${input.nextDate})` : input.note,
    occurred_at: new Date().toISOString(),
    metadata: { invoice: input.invoiceRef, next_date: input.nextDate, channel: input.channel },
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}
