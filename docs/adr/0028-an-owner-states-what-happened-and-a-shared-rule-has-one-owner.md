# ADR 0028 — An owner states what happened; a rule two entities need is answered by the owner of its noun

Date: 2026-10-28, revised 2026-10-29. Status: proposed.

This ADR extends ADR 0018 (a door answers questions) to entities that react to other entities'
facts. It also generalises ADR 0021's "recompute, never add". ADR 0023 (accepted 2026-10-28)
settled one case of it, the held fire. This ADR makes that case the rule for every such case.

Backlog S9, S10 and BUG-14. Found again, with a fourth spelling, by the architecture pass of
28 October 2026.

## Context

Quests, Ladders and Notifications are a new kind of feature: they react to what people did in
other entities.

- **Notifications** learns everything from event payloads and imports no other entity's door.
- **Ladders** treats events as a ping and recomputes the person from the owners' door
  questions. A nightly replay repairs what the events missed
  (`entities/ladders/lib/subscriptions.ts:1-9`, `recompute.ts:1-8`). That design is sound and
  idempotent.

The owners answer through **act facts**: a door question that "answers what a person did and
judges nothing" (`entities/ladders/lib/act-facts.ts:9-10`). Quests, Ideas, Boards and Training
each export them. Two things went wrong around them.

**The same rule was decided in several entities, and the decisions disagreed.** "A held fire"
was decided in three places from two inputs:

- Quests' `isHeld` checked the end time.
- Ladders' points and badges trusted Training's register, whose `held` means only "not
  cancelled".

So a Host got fire points partway through a session that Quests still showed as burning. ADR
0023 moved the judgment to Quests, the owner of the noun. On main, Quests' `isHeld`
(`quests/lib/evolve-model.ts:39-43`) refuses a fire that is cancelled, self-logged, still
burning, or attended by nobody but the Host, and Ladders reads that answer
(`ladders/lib/badge-acts.ts:86`). It is the pattern this ADR generalises:

- **The noun is Quests'.** "Held fire" and "Host" appear only in Quests' glossary.
- **Training states and does not judge** (ADR 0016). A `trainings` row has `ends_at`,
  `cancelled_at` and `self_logged`, but no host. The Host is `quests.host_id`.
- **Ladders has no clock** (ADR 0021), so it could not take the end check either.

**One consumer asks each owner twice.** Ladders reads Ideas and Boards through two questions
each, one for points and one for badges:

- `sparksOf` and `sparkFactsOf`;
- `shippedCardsOf` and `shippedCardFactsOf`.

Quests' pair went with ADR 0023 (card A.76); these two follow on A.77. Ladders spells "a shipped
leaf card" twice, once over each shape (`points.ts:111`, `badge-acts.ts:114`). One pair already
disagreed on paging (S10, BUG-14). Both spellings use the literal `"done"`. Boards has
`DONE_STATUS` (`entities/boards/lib/card-stage.ts:30`), but neither of its doors exports it.

## Decision

1. **An owner's door states what happened, in the owner's words, and judges nothing that is a
   consumer's business.** Training states the facts of a session: it ran or was cancelled, it
   ended, it was self-logged, and who was on the register.
2. **A predicate named in a glossary belongs to the entity whose glossary owns the noun, and is
   computed there only.**
   - Held fire is the settled case (ADR 0023): Quests answers it, and Ladders asks Quests.
   - A consumer that needs a stricter rule adds its own condition on top, by name, and does not
     restate the owner's. "A held fire earns the Host points" is Ladders' rule.
3. **One consumer asks one owner one question per kind of act.** The question returns the union
   of what the consumer's rules read (ADR 0018's union rule). Every rule the consumer applies
   over it is written once, so Ladders' points and badges read the same facts.
4. **A reacting entity that keeps a derived figure recomputes it from the owners' facts and
   never increments it.** It also runs a replay on a schedule (ADR 0027, rule 3). An event tells
   it whom to recompute, not what changed. This is ADR 0021's rule for Ladders, made the rule
   for any such entity.
5. **A reacting entity that only relays a fact** (Notifications) takes it from the event
   payload. The payload carries every fact the relay shows.
6. **An owner's constant is exported before a consumer may use it.** Boards exports
   `DONE_STATUS` from its door, and the literal `"done"` leaves Ladders.

## Alternatives rejected

- **Training owns "held", as this ADR's first draft said.** Training holds no Host, and its
  glossary has no such word. ADR 0023 rejected it for the same reason.
- **Each consumer keeps its own rule, pinned by a test that compares them.** A test proves two
  copies agree on the cases someone thought of. One owner proves it for every case.
- **Move the predicate into the kernel.** The kernel would learn what a Training session and a
  Raid are, which is the leak ADR 0026 removes for Ladders.

## Consequences

- **Ideas and Boards lose their points-only twins** (A.77). Ladders' points and badges then
  read one set of facts, as they already do for Quests.
- **Boards exports `DONE_STATUS`**, and both of Ladders' `"done"` literals go.
- **A new reacting entity** (the next game layer, a digest, a report) starts from the owners'
  fact questions and adds nothing to them but its own rules.

## Decided

On 2026-10-29 Khoa confirmed that **a self-logged session is never a held fire.** That is
already the rule on main: `isHeld` refuses it (`evolve-model.ts:40`), and a test plants a
self-logged session with a second attendee and expects a refusal (`evolve-model.test.ts:39`).
That test matters because the case cannot arise today. A Raid's session is made only by
`createTaughtSession`, which writes `self_logged: false`, and `takeSeat` refuses a self-logged
session. Quests' glossary entry gains "taught", so the word says what the rule checks.

## What would reopen it

A rule that genuinely differs by consumer, where both meanings are wanted and named. Then the
owner states the facts both need, and each consumer's rule gets its own name in its own
glossary, so the two are never mistaken for one.
