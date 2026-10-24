# ADR 0005 — Portability is declared in the catalogue, not remembered in a denylist

Date: 2026-09-10. Status: accepted.
Implements the consequence ADR 0001 stated and never built.

## Context

ADR 0001 decided one deployment per client and recorded, among its consequences,
that "every entity is marked internal or portable in the catalogue, and a
portable entity may never require an internal one." That field was never added.

What guarded the fork sync instead was `.github/fork-sync-exclude.txt`: seventy
hand-written path rules, plus `scan-tree.sh`, which re-reads the staged tree and
fails closed on anything credential-, person- or client-shaped. The scanner is
sound and has caught real leaks. The exclude list is **default-allow**, and its
own header already said so — "an exclude list is the weaker of the two designs
and it is the one that failed before."

It failed again, and the shape of the failure is the argument for this ADR:

- **`entities/htt`** — the Human Token Tracker, Edge8's own cost-of-delivery
  telemetry: forty-seven files, five crons and an eleven-table schema — synced
  to two client forks and ran in their production. No line excluded it because
  no line was ever written; the entity simply post-dated the list.
- **`/admin/revenue/aio-pad`** — a page for the second brand — reached a client's
  admin sidebar, survived a manual cleanup pass, and was still live weeks later.
- **`public/forecast.html`**, a financial forecast titled with the registered
  legal entity, and two OG cards named after client proposals, shipped to a
  client's public web root with no auth gate. The scanner already listed those
  clients by name; it never looked in a *path*, and a JPEG carries its client in
  the filename and nowhere else.

Two client repositories were then cleaned by hand, twice, incompletely both
times. The work does not scale to N clients and it is not survivable at
open-source, where a mistake is permanent.

## Decision

**Portability is a declared property of an entity, and the sync is derived from
the declaration.**

1. Every entity carries `portability: "portable" | "internal"` in
   `entities.manifest.json`. `validateManifest` rejects an entity without one, so
   a new entity cannot be added without the decision being made.
2. An otherwise portable entity may declare `internalPaths` — its Edge8-only
   pockets, entity-relative. This is the common case: `site` is portable but its
   service-line marketing is not; `portal` is portable but the human-token
   purchase flow is not.
3. `scripts/gen-fork-excludes.mjs` turns those fields into
   `.github/fork-sync-exclude.generated.txt`, including the `app/` mounts the
   exclusions leave with nothing to re-export. `stage-fork-tree.sh` reads it
   alongside the hand-written list. CI fails on drift.
4. `scripts/check-portability.mjs` proves the declaration is consistent: every
   local import of a shipping file must itself ship. That is one closure
   property, and it answers the question the sync actually cares about — not "is
   the boundary tidy" but "does the fork build".
5. Entities gain a third door, `upstream.ts`, so internal code in one entity can
   reach another's internal half without the portable doors carrying it. It is
   named for where its contents stay: "internals" already means an entity's
   ordinary private files here.
6. `scan-tree.sh` gains rules for **paths**, not just contents, and for the
   upstream's **own** identity — its legal entity, its second brand, its email
   domain, its Lark workspace.

The hand-written exclude list stays. It names documents, scripts and one-off
files that no machine can infer, and nothing about this ADR makes it redundant.

## Consequences

- An entity ships only because someone said it may. Forgetting is no longer a
  way to leak; the failure mode moves from a silent sync to a failed validation.
- **The staged tree is built, not just analysed.** The gate's claim is "the fork
  compiles"; only compiling it proves that, and the first attempt did not — 87
  errors. Two causes, both invisible to static analysis:
  - rsync patterns are fnmatch, so `[` opens a character class. Every exclude
    line naming a Next dynamic segment — `.../companies/[id]/Band.tsx` — matched
    nothing and shipped the file while sitting in the list looking correct. The
    same class of failure as the denylist itself: a rule that reads right and
    does nothing. `stage-fork-tree.sh` now rewrites `[` as `[[]` when reading
    either list.
  - A shipping page may legitimately import an internal module when the fork
    OVERLAY supplies its own copy at that path. The gate now knows that, and
    does not walk the upstream copy of an overlaid file, because the fork never
    receives it.
- The baseline is consequently **empty**. It was not, at first: eight edges sat
  in it, described as pages that "mix portable and internal content". Building
  the fork showed that all eight broke its build — the baseline was not
  recording debt, it was hiding a fork that did not compile. Each is now fixed,
  five through overlay stubs. The file stays so the ratchet exists for the next
  one, and a stale entry still fails the gate.
- **A link is a string, and no exclusion reaches inside a file.** Excluding the
  service-line pages left every list that pointed at them intact: the sitemap
  advertised eight pages that 404 on a fork's own domain, `llms.txt` described
  the upstream's services to AI crawlers in the upstream's words, and the site
  nav and footer linked to them from every page. Both files also hardcoded the
  upstream's own domain, so a fork's sitemap named it outright — as did
  `metadataBase` in the root layout, which sets the canonical origin for every
  page, and `getSiteOrigin()`, which had it as a silent fallback. The route map is now one module the overlay replaces
  (`entities/site/lib/public-routes.ts`), and scan-tree.sh has a rule for a
  quoted link to an internal route — with the trailing slash optional, which is
  what separates finding the sitemap from also finding the nav.
- **The generated composition root is regenerated in the staged tree** (B.32).
  `app/nav.ts` and `vercel.json` were generated here, where every internal pocket
  exists, and copied as they were: the fork's sidebar linked to eighteen pages it
  does not have (marketing, AIO Pad, the retreat P&L, surveys, portal tokens)
  and six crons 404'd on every run. `stage-fork-tree.sh` now runs the fork's own
  copy of `gen-deployment.mjs` after the exclusions. The cron list falls out of
  the mounts that are present, and each surface's `UNMOUNTED` list names the
  `internalPaths` routes the tree lacks so their rows leave the nav. The manifest
  decides and the tree only records that the decision was carried out, which is
  why the fork's own `check:generated` agrees with the file it received.
- **The marketing home page is the one thing this cannot fix.** It ships, it is
  exempt from the client-name rule as published marketing, and its service links
  sit inside the upstream's own copy and pricing. Link surgery would leave a
  fork advertising a retreat at $1,000/day with nothing to click. A fork
  replaces the page; nothing here should invent one for it.
- The overlay stubs duplicate upstream's types verbatim. That is the cost of the
  approach and the thing most likely to rot: a field added upstream and not
  added to a stub fails the FORK's typecheck, not this repo's. Building the fork
  in CI is what would catch it.
- `scan-tree.sh` deliberately does **not** rule on the bare token `edge8`. The
  fork is a working copy of Edge8's app and the word is still throughout its
  comments; blocking it would stop every sync and teach people to disable the
  scanner. The rules are the unambiguous ones: the second brand, the registered
  legal entity, a named client, an internal address.
- Adopting this surfaced coupling nobody had written down. `entities/retreats`
  turned out to hold the avatar, ID-document, QR and event-agenda code that four
  portable entities import, and `ui/experience/Subpage` is the page furniture the
  legal and unsubscribe pages render. Both are portable and were one careless
  `entities/retreats/` exclusion away from breaking the fork's build.
- Hardcoded fallbacks were the other half of the leak and are now configuration:
  the transactional sender, the ops and events inboxes, the founder digests, the
  support address in public mailto links, the organisation's schema.org identity,
  the registered legal entity and the Lark workspace host. Each previously had a
  default naming Edge8, which is how a fork mails the world as someone else.
