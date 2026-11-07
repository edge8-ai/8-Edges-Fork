# ADR 0026 — A page shows another entity's work through a slot, and a slot is declared once, by its provider

Date: 2026-10-28, revised 2026-10-29. Status: proposed. Khoa decided on 2026-10-29 where an
internal provider declares its slots (see "Decided").

This ADR records the slot mechanism, which no ADR describes, and changes where a slot is
declared. It extends ADR 0002 (entity contributions) and ADR 0004 (`requires` edges). ADR 0032
says when a need is a slot rather than a `requires` edge.

Backlog S12, M25 and W43. Found again by the architecture pass of 28 October 2026 and corrected
by the two-architect review of 29 October.

## Context

A page often needs a piece of another entity that its own entity may not require:

- the profile wears a Ladders emblem;
- the inbox shows a reimbursement decision;
- the Team Home shows training, claims and commitments.

A door import would add a `requires` edge, and several such imports would make a cycle
(`kernel/shell/faces.ts:6-9`: ladders requires the entities whose pages draw faces).

The answer that grew is the **slot**, and it works. A provider entity exports a value or a
component. The generated `app/shell.ts` imports it only when the provider is installed, and a
fallback stands in otherwise (`scripts/gen-deployment.mjs:349-356`).

`SHELL_SLOTS` has 28 entries, 24 without `site`'s four constants. In a variant, a provider
fills a kernel seam at boot instead of exporting a value. It does that through a `register`
function called from `instrumentation.ts` (`gen-deployment.mjs:555-565`, `faces.ts`).

Slots stopped being shell furniture long ago. Pages import them directly:
`app/team/(dashboard)/directory/[id]/page.tsx:10` takes from `@/app/shell`. The generator's
comment still calls them what "hand-written shells take" (`gen-deployment.mjs:349-355`). A slot
is the codebase's general way to inject one entity's work into another's page.

What did not hold is where a slot is written down. One slot is spelled in up to five places:

- its entry in the hand-kept `SHELL_SLOTS` list in the generator;
- its type in `kernel/shell/page-slots.ts`;
- the type's name in an import string the generator writes by hand (`gen-deployment.mjs:606`).
  Three slots already bypass it with inline `import("…")` types;
- `slots` in the consumer's `mounts.ts`;
- the export in the provider's `index.ts`.

The provider's vocabulary ends up in the kernel:

- 64 of the 204 lines of `page-slots.ts` speak of ladders, quests, tiers or badges, including
  `LearnShareAct = "hit" | "learning" | "fire" | "beacon"` (line 89).
- `faces.ts` says "the kernel knows nothing of ladders", yet declares
  `WornFace = { learnShare; builder }` (line 24).
- Eight of the slots are Ladders'.

Every Ladders and Quests card edits the same four central files. A slot's surface fence is
written by hand too: Ladders spells "never on admin" in a test of its own
(`ladders/fence.test.ts:416-426`).

Stylesheets follow the same pattern:

- A consumer's `mounts.ts` lists a provider's stylesheets by hand (`entities/team/mounts.ts`
  names Ladders' and Quests' CSS).
- `app/admin/admin.css` (13,036 lines) holds rules for boards, coaching and My Week. All three
  App shells import it (`app/team/(dashboard)/layout.tsx:24` and the admin and portal layouts).

## Decision

**A slot is how one entity's work appears on a page another entity owns, when the page's entity
does not require the provider** (ADR 0032: an optional enrichment is a slot). A page whose
entity does require the provider imports its door instead.

**The provider declares the slot, once, in its own folder.** Each entity that provides slots
exports a `slots.ts` beside `mounts.ts`, marked `@generator` like `mounts.ts` and
`permissions.ts`. For each slot it names:

- its kind: value, component or kernel registration;
- its type;
- its stylesheets;
- **the surfaces it may appear on.** The generator then refuses to mount it elsewhere, so a
  fence such as Ladders' "never on admin" is declared, not tested by hand.

The generator reads those declarations and writes everything else: the `SHELL_SLOTS` list, the
type imports and the fallbacks' signatures. The consumer still names the slots it takes in its
`mounts.ts`, because the consumer is the one deciding to show them.

**The kernel holds the contract, not the provider's words.** The kernel keeps what every slot
needs: the empty fallback, the face resolver's shape and the registration seam. A type that
only one provider and its consumers understand lives with the provider and reaches the consumer
through the generated `app/shell.ts`, but only when the provider is portable. A portable
consumer must still compile in the fork, where an internal provider is absent. So the type of a
slot whose provider is internal stays in the kernel.

**A slot brings its own styles.** The stylesheets a slot's component needs are part of its
declaration, and the generator loads them wherever the slot is mounted. No consumer lists a
provider's CSS. This keeps a deployment without the provider from loading the provider's own
stylesheets. It cannot do the same for rules that still live in `admin.css`; those leave one
entity at a time.

**Configuration is not a slot.** `site`'s four constants (`SITE_TITLE`, `SITE_DESCRIPTION`,
`SITE_NAME` and `LOGO_SRC`, `gen-deployment.mjs:587-590`) are the organisation's identity.
`app/layout.tsx:28-30` already falls back to `ORG_NAME` and `ORG_DESCRIPTION` from
`kernel/config/organisation.ts`, which owns them.

## Alternatives rejected

- **Keep the slot list in the generator.** That is the state today. It works, at the price of
  five edits per slot and a kernel that grows with each game feature.
- **Self-registration on import.** ADR 0002 rejected it for load order and tree-shaking. The
  per-layer module copies (W.170) make it worse: a registration in one layer is invisible in
  another. Boot-time registration through `instrumentation.ts`, which exists, is kept.
- **Let consumers require the provider.** Ladders requires the entities whose pages wear its
  emblems. The reverse edge would make a cycle, and `import/no-cycle` is an error.
- **Move the event catalogue to the publishers in the same change.** The catalogue is the other
  kernel file that carries entity words (`kernel/events/catalogue-quests.ts`). But it is a
  contract that two entities which cannot import each other must both compile against, and it
  says so (`catalogue.ts:1-4`). It stays in the kernel until a generated union is shown to be
  simpler.

## Consequences

- Adding a slot touches the provider's `slots.ts` and the consumer's `mounts.ts`, and nothing
  central. `check:generated` keeps the generated side honest.
- `kernel/shell/page-slots.ts` shrinks to the contract types, and `faces.ts` stops naming the
  ladders.
- `app/admin/admin.css` stops growing: a new entity's admin styles live with the entity. Moving
  the existing rules out is a separate card per entity, done when that entity is next touched.
- `site`'s five slots leave with the marketing split: `SiteFrame` and the four constants
  (ADR 0034). The root layout reads the organisation's identity from `kernel/config`.
- The kernel's navigation maps name entities too (`kernel/shell/admin-ia.ts:26,37`,
  `team-ia.ts:23` name "CRM" and "Retreats"). That is the same leak, left for its own card.
- The kernel's closed set of navigation icons (`kernel/shell/nav-icons.ts`, 65 icons) is the
  same question for icons. It is left as it is, because the single stroke grid is a deliberate
  design choice.

## Decided

Khoa decided on 2026-10-29 where an **internal** provider's slots are declared: **in the
entity**, like any other provider's. The question was open because `htt`, the first internal
provider (ADR 0032's Human Tokens band), is absent from the public fork, so a declaration in its
folder goes with it.

- `htt`'s slots are declared in `entities/htt/slots.ts`.
- A deployment without `htt` (the public fork, `minimal`) never reads that file, and the pages
  that take its slots get the empty fallback. The generator reads an internal provider's
  `slots.ts` only when the deployment installs it (`loadSlots`' `included`). A mount whose slot
  is therefore absent hands the page `null` instead of importing it, and the fork's staging
  regenerates the mounts as well as `app/shell.ts`.
- As the decision above already said, the slot's type stays in the kernel
  (`kernel/shell/human-tokens.ts`), so a portable page still compiles where `htt` is absent.
- A portable provider's `slots.ts` is still read whether installed or not. The hand-written
  shells take some portable providers' slots in every deployment and need their fallbacks, and
  a portable entity ships in every tree. For the same reason, the fence refuses a hand-written
  shell that takes an internal provider's slot.
- `scripts/internal-provider-slots.test.mjs` generates `minimal` and finds no `htt` slot in its
  `app/shell.ts`, and the portal home's mount handing `null`.

## What would reopen it

A slot that two providers fill differently in different deployments. Today every slot has one
provider and a fallback. A slot with a choice of providers is a plugin system, and that would
need its own decision.
