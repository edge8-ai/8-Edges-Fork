# ADR 0027 — Every event delivery is recorded, a fact written by the database is announced through an outbox, and each subscriber owns its replay

Date: 2026-10-28, revised 2026-10-29. Status: proposed. Amends ADR 0003 (soft cross-entity
effects go through an in-process event bus). It records as built the durable queue that ADR
0003 rejected.

This ADR describes decisions already in the code (Y.83/Y.86, Z.9) that no ADR records. Found by
the architecture pass of 28 October 2026. The two-architect review of 29 October corrected what
the outbox retries.

## Context

ADR 0003 rejected "a durable queue (Vercel Queues or a table)". It called one "premature while
no event has more than two subscribers and every handler is a fast row write". It said the bus
interface hid whether delivery was synchronous, so that the swap stayed possible.

Both premises have since gone:

- `board.card.completed` is now heard by coaching, ideas and ladders
  (`entities/coaching/lib/subscriptions.ts:19`, `entities/ideas/lib/subscriptions.ts:51`,
  `entities/ladders/lib/subscriptions.ts:12`). There are 54 `subscribe("…")` calls across
  entities, 36 of them Notifications'. ADR 0003's vocabulary note listed five events.
- From S.3 to W.170 no subscriber ran in production, and nothing said so
  (`kernel/events/deliveries.ts:7-8`). An in-process bus that logs a failure to the console
  cannot tell an event nobody heard from an event nobody published.
- `candidate.hired` is decided inside a database function
  (`company_os.record_application_decision`). The process can die between that commit and the
  publish, and the hire would then never open an onboarding journey.

Two mechanisms were built to answer those, Y.86 and Z.9. Both live only in code comments, and
the comments are easy to over-read.

**What the outbox actually retries:**

- `publish` runs each handler in turn. When a handler fails, it writes a failed delivery row,
  audits the failure, and carries on. It never throws for a handler
  (`kernel/events/bus.ts:91-110`).
- `deliverOutbox` marks a row published as soon as `publish` returns
  (`kernel/events/outbox.ts:76-82`).
- So the outbox retries a publish that **threw**: an event name outside the catalogue, a payload
  that fails its schema, a process that died, or a claim gone stale. It does not retry a
  subscriber that failed.
- When onboarding's handler fails on `candidate.hired`, the outbox is done with the event. What
  repairs it is onboarding's own `backfillJourneys()` (`entities/onboarding/lib/cycle.ts:248,
  359`).
- The delivery row cannot drive a retry either. It records `event_name`, `event_id`,
  `subscriber`, `ok`, `error` and `duration_ms`, and not the payload.

**Two kernel mechanisms run on entity crons:**

- The only call to `deliverOutbox()` that drains every pending row is in hiring's driver
  (`entities/hiring/crons/hiring-driver.ts:47`). The other call is hiring's own, for one hire
  (`hiring/lib/chain/deps.ts:63`).
- The watchdog that reads the delivery log is company-os's
  (`entities/company-os/crons/automation-watchdog.ts`).

A deployment without hiring drains nothing.

## Decision

The bus stays in-process and awaited, as ADR 0003 decided. Three rules are added around it:

1. **Every subscriber run leaves a row.** The bus writes one `company_os.event_deliveries` row
   per handler run, ok or failed, with one `event_id` per publish (`bus.ts:88-98`).
   `deliveries.ts` is the table's only writer. A watchdog reads it daily and reports an event
   that reached fewer subscribers than it has, so "nobody heard it" becomes a fact someone is
   told.
2. **A fact committed by a database function is announced through the outbox.**
   - The function inserts its event into `company_os.event_outbox` in the same transaction as
     the fact.
   - A driver claims pending rows, publishes them on the bus and marks them published.
   - Delivery is **at least once per publish**: a claim older than five minutes is taken again,
     and a row is left for a person after five attempts.
   - Rows that another application writes for the App to process use the same claim and
     attempt columns, but not the bus. The kernel's intake drain awaits one handler per kind
     and marks a row processed only when that handler succeeds (ADR 0034).
3. **Each subscriber owns its replay.** The bus guarantees a delivery row, not a retry. A
   subscriber whose missed effect would leave something wrong must rebuild from the owners'
   facts on a schedule:
   - Ladders replays nightly (ADR 0021);
   - onboarding backfills journeys.

   A subscriber without a replay accepts that a failure is reported and lost. Notifications is
   one such subscriber today, and that is a choice made on its card, not by default.

Because of rules 2 and 3, **every subscriber must tolerate the same event twice.** A handler is
written as "make it so", not "add one":

- Ladders recomputes a person rather than adding points (`ladders/lib/subscriptions.ts:1-9`).
- Onboarding opens one journey per hire.

**The outbox drain and the delivery watchdog run in every deployment.** They are kernel
mechanisms and must not depend on hiring or company-os being installed. They move before any
second database function, or any second application, writes to the outbox. Where they live is
decided on the card: a routine the kernel declares, which the generator would need to learn, or
one owned by an entity every deployment installs.

An event published from TypeScript after a write that has already committed does not go through
the outbox. It keeps ADR 0003's semantics: delivered once, in the request, or recorded as failed.

## Alternatives rejected

- **A queue for every event** (Vercel Queues, or the outbox for all publishers). The outbox is
  needed only where the fact and the publish cannot share a transaction any other way. Routing
  every event through a table would add a driver and a claim protocol to effects that are fast
  row writes today.
- **Retry a failed subscriber from its delivery row.** The row does not carry the payload.
  Keeping every payload, and replaying it to one subscriber, is a queue by another name. The
  subscriber's own replay already exists where it matters.
- **Leave an outbox row unpublished while any of its deliveries failed.** This retries every
  subscriber of the event, including the ones that succeeded, and it still only covers events
  that came through the outbox.
- **Fire-and-forget.** Still rejected, for ADR 0003's reason: on Vercel the function may be
  frozen before the handler runs.

## Consequences

- ADR 0003's "a slow subscriber slows the publisher" still holds, and now has a number: the
  delivery row carries `duration_ms`. Ladders recomputes a person from ten door questions
  inside the request that moved the card (`ladders/lib/subscriptions.ts:36-38`).
- A new subscriber is reviewed for two things: idempotency, and whether it needs a replay.
- The ideas relay is one such subscriber. When it fails, `idea.shipped` is never published and
  nothing replays it (backlog W44).
- `docs/engineering/entities.md` lists 7 events in its bus table. The catalogue in
  `kernel/events/catalogue*.ts` is the list.

## What would reopen it

Any of these is the point at which events move behind a durable queue with per-subscriber
retry:

- a subscriber that does slow work (a model call, an outside API) inside the publisher's
  request;
- a `duration_ms` on any event's deliveries that a user feels;
- a second event whose fact is written by a database function, and whose subscriber can neither
  be made idempotent nor replay.
