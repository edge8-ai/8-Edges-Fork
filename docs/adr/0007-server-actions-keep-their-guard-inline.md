# ADR 0007 — Server actions keep their guard inline; the seam is a checker, not a wrapper

Date: 2026-09-19. Status: accepted.

Records a decision taken during A.12–A.15 (PR #1473), so a future architecture
review does not re-propose the wrapper on the same evidence.

## Context

Rule 1 says the first statement of every exported server action is
`await requireAdmin()` or a sibling, and `scripts/check-action-auth.mjs`
enforces it by regex — `callsGuard(body)` tests the function body for
`await <GUARD>(`. The architecture review of 19 September 2026 called this out:
the action seam exists as a grep in CI rather than as a module, and every action
restates the same four beats around the one line that differs.

Measured at that review, and the numbers are why the proposal looked strong:

- `entities/` holds **126** files carrying `"use server"`, with **513** exported
  async functions.
- Within `entities/coaching` alone: **70** actions, median **10** lines, of
  which roughly four are fixed ceremony — guard, `parseInput`, the `if (!p.ok)`
  bail, the revalidate.
- **1,895** `{ ok: false, error: … }` literals across `entities/**/*.ts`
  (non-test); the string `"Not found."` is retyped **100** times.
- `kernel/data/result.ts` is a bare type alias with no constructor.

The proposal was a kernel `action()` module taking the guard, the schema and the
revalidation set, returning `Result`, with `check-action-auth.mjs` taught to
recognise it — after which an action without a guard would stop being
expressible, rather than merely being caught.

## Decision

**Actions keep the guard as their first inline statement. No wrapper is
introduced.** The ceremony stays until something genuinely varies across that
seam.

Three findings decided it.

**The ceremony is not covering a defect.** Of coaching's 70 actions, **70/70**
already await a guard and **68/70** already parse their input with Zod; the two
that do not take no client input at all. The repetition is real, but it is
repetition of code that is already correct. A wrapper would make the guard
unforgeable for code not yet written, which is worth something — and nothing
else.

**The signature change lands on a surface this repo already knows is
fragile.** A wrapper turns `addGoal(profileId, input)` into
`addGoal({ profileId, input })`. **All 67** distinct exported coaching actions
are referenced from at least one `.tsx`, because client components receive
actions as props. `npm run audit:wiring` exists precisely because an action
handed to the wrong prop typechecks and fails silently, and it compares against
a commit rather than a rule, so it cannot be a gate. Rewriting 67 signatures
across that surface, to fix no defect, is the wrong trade.

**A wrapper with no second adapter is a seam we tell ourselves not to build.**
The design vocabulary the review runs on (`/codebase-design`) holds that one
adapter means a hypothetical seam and two mean a real one. Nothing varies at
this seam today: every coaching action uses the same guard
(`requireTeamMember`, 70/70), the same parser and the same `Result`. Building
the wrapper and migrating nothing would add an abstraction for a need the code
does not have; building it and migrating everything is the churn above.

## What was rejected

- **The kernel `action()` wrapper**, for the three reasons above. It is the
  decision this ADR exists to record.
- **A `Result` constructor** (`ok()` / `fail()` / `notFound()`) to absorb the
  1,895 literals. It fails the deletion test: delete it and the complexity moves
  back to the call sites rather than concentrating anywhere. The duplicated
  strings are per-context user-facing messages — `"Invalid AI Program."`,
  `"That AI Program no longer exists."` — which are meant to be local, and a
  shared `notFound()` would push them towards a single vaguer one.
- **Migrating one action module as a proof and leaving the rest.** Two shapes
  for the same thing in one entity is worse than one shape, and the proof would
  have been of a pattern nothing had committed to.
- **Leaving `check-action-auth.mjs` as it was.** Rejected: see below.

## Consequences

- **The checker got stricter instead.** It only ever matched `function`
  declarations, so an `export const foo = async () => {…}` action was not
  collected at all — the gate reported such a file clean rather than ungated.
  No action in the tree used that shape, so nothing was exposed, but the next
  one written in it would have been. It now collects arrow-function exports,
  including expression bodies. The seam is still a grep; it is a grep that sees
  every shape an action can take.
- **The duplication that was a defect was fixed separately.** `refresh()` was
  byte-identical in four coaching action modules and different in a fifth, and
  the only way to learn that was to open all five.
  `entities/coaching/lib/revalidate.ts` is now the one home, with the sets
  *named* rather than merged — `schedule-actions.ts` differed for a documented
  reason — and zero raw `revalidatePath` remains in the entity.
- **Rule 1 stands unchanged**, and so does its cost: a new action that forgets
  its guard is caught by CI rather than prevented by a type.
- **What would reopen this.** A concern every action must run that no regex can
  check — per-action tracing, rate limiting, an audit row, a second guard kind
  whose ceremony differs — is something varying at the seam, and then the
  wrapper has its second adapter. Reopen on that, not on the line counts: the
  line counts were known when this was decided.
