# ADR 0008 — The portal is rendered per request, so `revalidateSurfaces` stays two-surface

Date: 2026-09-20. Status: accepted.

Records the decision taken on card C.27, a follow-up to 4b13dd13, so the next
reader of `kernel/shell/surface.ts` does not re-open it on the same evidence:
the helper's own comment calls it "the two-surface helper" while the repo has
three authenticated surfaces, which reads as an oversight and is not one.

## Context

`revalidateSurfaces(path, type?)` in `kernel/shell/surface.ts` calls
`revalidatePath` twice, for `/admin${path}` and `/team${path}`. There are 59
call sites. The portal — the third authenticated surface, guarded by
`requirePortalMember` — gets nothing.

The question the card asked was which of three shapes to adopt: the helper
learns a third surface, the portal declares the paths it cares about, or the
event bus (ADR 0003) carries the refresh. Reading the call sites and the portal
answers a prior question instead — whether the portal has anything to
invalidate.

Two measurements decided it.

**Every call site names a path the portal does not have.** All 59 pass a
`/revenue/…` path: `"/revenue/leads"`, `` `/revenue/companies/${companyId}` ``,
`"/revenue/marketing/calendar"`, and so on. They come from three entities —
`crm` (33), `campaigns` (22), `retreats` (4) — plus two in `company-os`. The
portal's route tree is `/portal/…`, `/proposals`, `/surveys/[slug]`,
`/t/[code]` and `/work/[token]`; there is no `/portal/revenue` and no plan for
one. Option (1) would add 59 `revalidatePath("/portal/revenue/…")` calls that
match no route in any deployment.

**Nothing the portal serves is cached.** Of the 29 route entries in
`entities/portal/mounts.ts`, every one that renders data declares
`dynamic: "force-dynamic"`; the five that do not are two stylesheet-only
layouts, a third stylesheet-only layout and a `"use client"` error boundary.
The three dynamic-segment pages with no mount entry —
`requests/[id]`, `programs/[id]`, `meetings/[id]` — each `await
requirePortalMember()`, which reads `cookies()` and forces a dynamic render on
its own. `/proposals` renders a list that is literal in the source file and
reads no table at all. So the portal has no prerendered output and no
incremental cache entry: `revalidatePath` on a portal path would find nothing to
throw away, and the portal already re-reads the database on every request.

The card's own example — "an admin editing a company does not invalidate the
portal's server-side render of it" — is the case that does not arise:
`routes/portal/(dashboard)/company/page` is `force-dynamic`, so the next request
renders the edit.

## Decision

**`revalidateSurfaces` keeps covering `/admin` and `/team` only. None of the
three proposed shapes is built.** The portal is correct today by construction —
it renders per request — and the fix is to make that construction legible and
guarded rather than to add a mechanism that would currently be a no-op.

What ships instead:

- The comments on `kernel/shell/surface.ts` and `surface-shared.ts` say *why*
  there are two surfaces here and not three, and point at this ADR.
- `scripts/portal-render-is-dynamic.test.mjs` fails if a portal route that reads
  data becomes cacheable — that is, if it neither declares `force-dynamic` in
  `mounts.ts` nor reads the request. The premise above is the load-bearing part
  of this decision, and it is exactly the kind of premise that rots silently: a
  page added without a mount entry, or a `dynamic` line deleted in a cleanup,
  would reintroduce the gap with nothing to notice. The test turns "the portal
  is not cached" from an observation into an invariant, and its failure message
  names this ADR as the thing to reopen.

The kernel gains no knowledge of any entity: the helper is unchanged, and the
test is a file-reading script alongside the other structural gates, not an
import.

## What was rejected

- **(1) The helper covers three surfaces.** It would pay a third
  `revalidatePath` on all 59 call sites, on paths that do not exist, to
  invalidate caches that do not exist. It also makes the kernel assert that
  every surface mirrors every path, which is false: `/admin` and `/team` mirror
  each other by design (the Revenue section is the same screens twice, which is
  why the helper exists), and the portal is a different product surface with its
  own information architecture (`kernel/shell/portal-ia.ts`).
- **(2) The portal declares the paths it cares about.** The stronger of the
  three, and the one to build first if this reopens — a write says *what*
  changed and the portal maps that to its own routes, which is the only mapping
  that could ever be right. It is rejected now because the declaration would be
  empty: there is no portal path whose cached render a `/revenue/…` write would
  invalidate. Building the registry with nothing in it is an abstraction for a
  need the code does not have.
- **(3) The event bus carries it.** ADR 0003's bus is for soft cross-entity
  *effects* — a past-tense fact, subscribers registered at the composition root,
  a handler failure logged and never reaching the publisher. Cache invalidation
  is not soft: a dropped event is a stale page with no signal. Routing refreshes
  through a best-effort bus would make correctness depend on the one mechanism
  in the repo that is explicitly allowed to fail. It would also add a publish on
  every write for subscribers that, today, would have nothing to invalidate.
- **Making portal pages cacheable and then revalidating them.** A real option,
  and the one that would make this whole question live. It is a performance
  change with a correctness cost, and it should be argued on its own evidence —
  a measured slow portal page — not adopted as a side effect of tidying a
  helper. Note the trap recorded in the repo: `force-dynamic` alone does not
  stop Next caching the `fetch` calls underneath supabase-js, so any such change
  has to reason about `fetchCache` as well.

## Consequences

- The 59 call sites are untouched, and a write still costs two
  `revalidatePath` calls rather than three.
- The portal's freshness now rests on a stated invariant with a gate behind it,
  instead of on an accident of how its pages were written. Before this card,
  `dynamic: "force-dynamic"` on a portal page was a line anyone could delete.
- `RefreshOnStale` (card 4b13dd13) remains mounted on all three dashboard
  layouts and is unaffected; it covers a different failure — a tab left open —
  rather than the write path.
- **What would reopen this.** A portal page that is deliberately cached, or a
  portal route that mirrors an `/admin` path so the existing `path` argument
  would mean something there. On either, build option (2): the portal declares
  its paths. The 59 call sites are not the reason to keep the helper as it is —
  the absence of anything to invalidate is.
