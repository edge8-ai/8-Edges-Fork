import { companyOs } from "@/kernel/data/supabase";
import type { Invariant } from "@/kernel/audit/invariants";
import type { EventName } from "./catalogue";

// The record of event delivery (Y.86, decision Y.83): one company_os.event_deliveries
// row per subscriber run, ok or not, written by the bus after each handler.
// Before it, a handler that never ran left no trace at all: from S.3 to W.170
// no subscriber ran in production and nothing said so. This is the table's
// only writer.

export type Delivery = {
  eventName: EventName;
  eventId: string;
  subscriber: string;
  ok: boolean;
  error: string | null;
  durationMs: number;
};

/**
 * Write one delivery row. Best-effort, like the handler it describes: a failed
 * write is logged and never reaches the publisher, because an optional
 * record must not fail a required action. Without a database configured (a
 * test, a local script) nothing is written.
 */
export async function recordDelivery(d: Delivery): Promise<void> {
  if (!process.env.SUPABASE_URL) return;
  try {
    const { error } = await companyOs.from("event_deliveries").insert({
      event_name: d.eventName,
      event_id: d.eventId,
      subscriber: d.subscriber,
      ok: d.ok,
      error: d.error,
      duration_ms: Math.max(0, Math.round(d.durationMs)),
    });
    if (error) console.error(`[kernel/events] delivery of ${d.eventName} to ${d.subscriber} not recorded: ${error.message}`);
  } catch (err) {
    console.error(`[kernel/events] delivery of ${d.eventName} to ${d.subscriber} not recorded:`, err);
  }
}

/**
 * Z.15.7: every event published in the last day reached every entity that
 * subscribes to it now, and no delivery failed. `subscribersOf` is the bus's
 * own registry in the process running the check; an event with no subscriber
 * leaves no rows, which is a legal state. Rows are counted per distinct
 * (event, subscriber), so a doubled write cannot hide a missing one.
 */
export function deliveriesReachedSubscribers(subscribersOf: (name: EventName) => string[]): Invariant {
  return {
    id: "Z.15.7",
    name: "every event reached every subscriber, and none failed",
    check: async (now) => {
      const since = new Date(now.getTime() - 86_400_000).toISOString();
      const { data, error } = await companyOs
        .from("event_deliveries")
        .select("event_name, event_id, subscriber, ok, error")
        .gte("delivered_at", since)
        .limit(20000);
      if (error) throw new Error(`event_deliveries: ${error.message}`);
      const rows = (data ?? []) as { event_name: string; event_id: string; subscriber: string; ok: boolean; error: string | null }[];
      const byEvent = new Map<string, { name: string; reached: Set<string> }>();
      const failed: string[] = [];
      for (const r of rows) {
        const e = byEvent.get(r.event_id) ?? { name: r.event_name, reached: new Set<string>() };
        e.reached.add(r.subscriber);
        byEvent.set(r.event_id, e);
        if (!r.ok) failed.push(`${r.event_name} to ${r.subscriber}: ${r.error ?? "no error recorded"}`);
      }
      const missed: string[] = [];
      for (const [id, e] of byEvent) {
        const absent = subscribersOf(e.name as EventName).filter((s) => !e.reached.has(s));
        if (absent.length) missed.push(`${e.name} ${id.slice(0, 8)} never reached ${absent.join(", ")}`);
      }
      if (failed.length === 0 && missed.length === 0) {
        return { ok: true, detail: `${byEvent.size} event(s) in the last day reached every subscriber` };
      }
      const parts = [...failed.slice(0, 5), ...missed.slice(0, 5)];
      return { ok: false, detail: `${failed.length} failed, ${missed.length} missed: ${parts.join("; ")}` };
    },
  };
}
