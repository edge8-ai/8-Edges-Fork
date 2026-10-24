import { companyOs } from "@/kernel/data/supabase";
import { currentRunMode } from "@/kernel/audit/run-context";
import { publish } from "./bus";
import { EVENTS, type EventName, type EventPayload } from "./catalogue";

// The event outbox (Z.9, decision 13, plan G9). An event whose fact is written
// by a database function is recorded in company_os.event_outbox in the same
// transaction as the fact, so it is never announced for a write that rolled
// back and never lost when the process dies between the write and the
// publish. This delivers it: claim a pending row, publish it on the bus,
// mark it published. The first writer is company_os.record_application_decision
// (candidate.hired); the hiring driver delivers what the deciding step's own
// delivery missed, on its next tick.
//
// At least once: a process that dies after the publish and before the mark
// leaves the row to be delivered again once its claim goes stale. The bus's
// subscribers are written to tolerate a repeat (onboarding opens a journey
// once per hire). A shadow run delivers nothing, because a publish in shadow
// reaches no subscriber, and marking the row published would lose the event.

/** A claim older than this is taken again: its publisher is gone. */
const STALE_MS = 5 * 60_000;
/** Attempts before a row is left for a person: a payload the catalogue refuses never becomes valid. */
const MAX_ATTEMPTS = 5;

/** `exhausted`: rows out of attempts, never retried, for the caller to report to Operations. */
export type OutboxResult = { published: number; failed: number; exhausted: number; errors: string[] };

function isEventName(name: string): name is EventName {
  return name in EVENTS;
}

/**
 * Deliver what is pending, oldest first; or, with `only`, the one row for that
 * event and key. Never raises: a failure is counted and stays on the row.
 */
export async function deliverOutbox(only?: { eventName: EventName; dedupeKey: string }, limit = 20): Promise<OutboxResult> {
  const out: OutboxResult = { published: 0, failed: 0, exhausted: 0, errors: [] };
  if (currentRunMode() === "shadow") return out;
  if (!only) {
    // A row out of attempts drops out of the sweep below; counted here so it is never silent.
    const { count, error: countErr } = await companyOs
      .from("event_outbox")
      .select("id", { count: "exact", head: true })
      .is("published_at", null)
      .gte("attempts", MAX_ATTEMPTS);
    if (countErr) out.errors.push(`event_outbox count: ${countErr.message}`);
    else out.exhausted = count ?? 0;
  }
  const staleBefore = new Date(Date.now() - STALE_MS).toISOString();
  let q = companyOs
    .from("event_outbox")
    .select("id, event_name, payload, attempts")
    .is("published_at", null)
    .lt("attempts", MAX_ATTEMPTS)
    .or(`claimed_at.is.null,claimed_at.lt."${staleBefore}"`)
    .order("created_at")
    .limit(limit);
  if (only) q = q.eq("event_name", only.eventName).eq("dedupe_key", only.dedupeKey);
  const { data, error } = await q;
  if (error) {
    out.errors.push(`event_outbox read: ${error.message}`);
    return out;
  }
  for (const row of data ?? []) {
    // The claim: one publisher per row at a time.
    const { data: claimed, error: claimErr } = await companyOs
      .from("event_outbox")
      .update({ claimed_at: new Date().toISOString(), attempts: row.attempts + 1 })
      .eq("id", row.id)
      .is("published_at", null)
      .eq("attempts", row.attempts)
      .select("id");
    if (claimErr || !claimed || claimed.length === 0) continue;
    try {
      if (!isEventName(row.event_name)) throw new Error(`"${row.event_name}" is not in the event catalogue`);
      await publish(row.event_name, row.payload as unknown as EventPayload<typeof row.event_name>);
      const { error: markErr } = await companyOs
        .from("event_outbox")
        .update({ published_at: new Date().toISOString(), last_error: null })
        .eq("id", row.id);
      if (markErr) throw new Error(`published, but not marked: ${markErr.message}`);
      out.published++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      out.failed++;
      out.errors.push(`${row.event_name} ${row.id}: ${message}`);
      const { error: noteErr } = await companyOs.from("event_outbox").update({ last_error: message.slice(0, 500) }).eq("id", row.id);
      if (noteErr) console.error(`[kernel/events] outbox ${row.id}: could not record the failure: ${noteErr.message}`);
    }
  }
  return out;
}
