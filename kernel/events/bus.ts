// The in-process event bus (RS-13, spec §P5, docs/adr/0003).
//
// It exists for one kind of coupling: a *soft effect*, where something happens
// in entity B because of an action in entity A, and A is still meaningful
// without B. Before the bus, A imported B's writer, so a deployment that left B
// out did not compile. Now A publishes a named fact and B subscribes, and a
// deployment without B simply has no subscriber.
//
// A hard dependency — where A's feature is meaningless without B — is NOT this.
// That stays a direct call through B's door along a declared `requires` edge,
// because the caller needs the result and the failure.
//
// Three rules, from the ADR:
//   * handlers run in-process and are awaited, so an effect that must land
//     before the request returns does;
//   * a handler failure is logged and audited and never reaches the publisher,
//     because an optional entity must not be able to fail a required one;
//   * publish returns nothing. A publisher that needs an answer has a hard
//     dependency and should call the door.
//
// Delivery is deliberately hidden behind `publish`, so the in-process loop can
// become a durable queue later without touching a single publisher.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { recordAudit } from "@/kernel/audit/audit";
import { heldInShadow } from "@/kernel/audit/run-context";
import { recordDelivery } from "./deliveries";
import { EVENTS, type EventName, type EventPayload } from "./catalogue";

type Handler = (payload: unknown) => Promise<void> | void;
type Registry = Map<EventName, { entity: string; run: Handler }[]>;

// The registry lives on the process, not on this module (W.170). Next compiles
// instrumentation.ts, which registers the subscribers, into its own module
// graph, and every route handler, page and server action into others, so a
// server holds several copies of this file. A Map at module scope was filled in
// the instrumentation's copy and read empty by every request's copy: from S.3
// to W.170 no subscriber ever ran in production, and nothing logged it, because
// a publish to nobody is a legal state. `Symbol.for` gives every copy the same
// key, which is how Next keeps its own server-wide singletons.
const REGISTRY = Symbol.for("edge8.kernel.events.handlers");
const processGlobal = globalThis as typeof globalThis & { [REGISTRY]?: Registry };

/** name -> the handlers registered for it, in registration order. */
const handlers: Registry = (processGlobal[REGISTRY] ??= new Map());

/**
 * Register one entity's interest in one event. The composition root calls this
 * for the entities a deployment includes, and nothing else does: an entity that
 * registered itself on import would make registration depend on load order.
 */
export function subscribe<N extends EventName>(
  entity: string,
  name: N,
  run: (payload: EventPayload<N>) => Promise<void> | void,
): void {
  const list = handlers.get(name) ?? [];
  list.push({ entity, run: run as Handler });
  handlers.set(name, list);
}

/** Which entities are listening. Used by the bus's own tests to prove that a
 *  deployment with no subscriber is a real state, not an accident. */
export function subscribersOf(name: EventName): string[] {
  return (handlers.get(name) ?? []).map((h) => h.entity);
}

/** Drops every registration. Tests only — the composition root registers once. */
export function resetSubscribers(): void {
  handlers.clear();
}

/**
 * Publish a fact. The payload is validated first, because a malformed event is
 * the publisher's bug and should fail there rather than in a subscriber; after
 * that no handler can fail the caller.
 */
export async function publish<N extends EventName>(name: N, payload: EventPayload<N>): Promise<void> {
  const schema = EVENTS[name] as z.ZodType<EventPayload<N>>;
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`publish(${name}): invalid payload — ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  // A fact published inside a shadow run (Z.17) reaches no subscriber: what a
  // subscriber does (a card, a message, a write in another entity) is an
  // effect the shadow run must not have. The run's log names the event.
  if (heldInShadow("event", name)) return;
  // One id per publish, on every subscriber's delivery row (Y.86), so the
  // watchdog can tell an event that reached three of its four subscribers.
  const eventId = randomUUID();
  for (const { entity, run } of handlers.get(name) ?? []) {
    const started = Date.now();
    try {
      await run(parsed.data);
      await recordDelivery({ eventName: name, eventId, subscriber: entity, ok: true, error: null, durationMs: Date.now() - started });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await recordDelivery({ eventName: name, eventId, subscriber: entity, ok: false, error: message, durationMs: Date.now() - started });
      console.error(`[kernel/events] ${entity} failed handling ${name}:`, message);
      // Audited, not just logged: a dropped effect is invisible otherwise, and
      // the trail is what tells someone the follow-up never happened.
      await recordAudit({
        table: "events",
        // An event's name is not a uuid; newData carries it (B.13).
        recordId: null,
        operation: "update",
        actor: `kernel/events:${entity}`,
        newData: { event: name, entity, error: message },
      }).catch(() => undefined);
    }
  }
}
