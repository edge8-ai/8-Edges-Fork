# ADR 0003 — Soft cross-entity effects go through an in-process event bus

Date: 2026-09-08. Status: accepted.

## Context

Some effects cross entities without either entity requiring the other: coaching writes to a
person's timeline, a Stripe payment updates a program, a campaign send produces email
events. Today these are direct imports of the owner's writer, so the caller fails to compile
when the owner is excluded from a deployment.

## Decision

The kernel provides a typed event bus. A publisher emits a named past-tense event with a
Zod-validated payload. Subscribers are registered by the composition root for included
entities only. Handlers run in-process, awaited, during the same request. A handler error is
logged and audited and never propagates to the publisher. Hard dependencies keep calling
doors directly; the bus is only for soft effects, and ships with the handful that exist
today rather than a catalogue.

## Alternatives rejected

- A durable queue (Vercel Queues or a table). Correct eventually, premature while no event
  has more than two subscribers and every handler is a fast row write. The bus interface
  does not expose whether delivery is sync, so the swap stays possible.
- Fire-and-forget without await. On Vercel the function may be frozen before the handler
  runs.

## Vocabulary, 2026-09-22 (S.2)

The bus shipped carrying one event for two weeks, which was the point of "the handful that
exist today" but left the decoupling unbought. Four more landed together — `leave.approved`,
`candidate.hired`, `deal.won`, `invoice.paid` — each with one subscriber, and each chosen by
the same test: the publisher must be an entity the subscriber `requires`, so a direct call
was never available and the event is not a call in disguise. The table in
`docs/engineering/entities.md` lists them with the scan or direct read each reaction
replaces. Nothing in this decision changed; the three rules are exercised per event in
`kernel/events/bus.test.ts`.

## Consequences

- A slow subscriber slows the publisher. Acceptable for v1; the queue is the escape hatch.
- Publisher and subscriber agree on a payload schema in the kernel, which is a small shared
  contract per event and the price of decoupling the imports.
