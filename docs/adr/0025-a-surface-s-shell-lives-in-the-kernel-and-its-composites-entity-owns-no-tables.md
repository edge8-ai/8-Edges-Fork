# ADR 0025 — A surface's shell lives in the kernel; the entity that holds its composite pages is marked `kind: "surface"` and owns no tables

Date: 2026-10-28, revised 2026-10-29. Status: proposed. Khoa decided its open questions on
2026-10-29, and two contradictions found while preparing them are corrected (see "Decided").

This ADR completes ADR 0002 (surfaces are kernel shells that render entity contributions)
instead of superseding it. The first draft created a `surfaces/` directory. The two-architect
review of 29 October rejected that, because the Admin shell already sits in the kernel.

Backlog H2. Found by the architecture pass of 28 October 2026.

## Context

ADR 0002 decided three things:

- a surface is "a shell owned by the kernel";
- "the entity that owns a table owns every screen that writes it";
- "Company OS ceases to be an entity; its screens go to their owners".

The glossary agrees: "A surface is not an entity and owns no tables" (`CONTEXT.md:70`).

**The code went partly the other way.** `scripts/gen-app-mounts.mjs:294-304` says "a surface
belongs to an entity: the team hub exists because the team entity does". `SURFACE_LAYOUT_OWNER`
gives Admin to `company-os`, Team to `team` and Portal to `portal`. That rule keeps the minimal
build from carrying a shell with nothing to show. It is a question of when a shell is installed,
though, not of where its code lives.

How far each shell already is:

- **Admin is most of the way to ADR 0002.** `app/admin/(dashboard)/layout.tsx` takes these from
  the kernel and the generated slots:
  - `AdminShell` from `kernel/shell` (line 16);
  - the assistant and the avatar resolver from `@/app/shell` (line 26).

  Its only entity import is `signOut` from `company-os` (line 20).
- **Team** imports `TeamAssumeBanner`, `TeamSidebar`, `TeamChatWidget` and `TEAM_APP_METADATA`
  from `team` (`app/team/(dashboard)/layout.tsx:15`). These are cheap to move:
  - `TeamSidebar` uses kernel shell pieces plus team's own `signOut`;
  - `TeamChatWidget` wraps the assistant's `ChatWidget`, the same shape as the `AdminAssistant`
    slot.
- **Portal** imports `portalEntitlements`, `listProgramNamesForActor`, `PortalSidebar` and
  `AssumeBanner` from `portal` (`app/portal/(dashboard)/layout.tsx:9`).
- **Three copies of `signOut`** exist: `company-os/lib/actions.ts:6`, `team/lib/actions.ts:8`
  and `portal/lib/actions.ts:18`. The kernel already has the shared core,
  `kernel/identity/session.ts:11` `signOutTo`.

**What actually grew is the entities that hold the screens:**

- `team` requires 13 entities (17 through their requirements), is required by none, and owns
  two tables, `kudos` and `performance_reviews`. Its edges come from `team/lib/data.ts:8-24`,
  which imports the doors of ideas, hiring, contacts, org and crm. They do not come from its
  route bodies.
- `company-os` owns `integration_sources` and the view `people_with_deals`. It also holds
  Settings → Access, access codes, agents and assume
  (`routes/admin/(dashboard)/settings/`). Those screens write kernel tables
  (`lib/access-grant.ts:30-33` writes `access_roles`, `access_role_permissions` and
  `access_role_assignments` through `kernel/identity/writes.ts`). The kernel has no `routes/`
  anywhere, so these screens cannot move to their tables' owner.

**`company-os` is not a composite. Other entities require it for jobs of its own:**

- crm calls `grantRoleTo` (`crm/lib/team-portal-actions.ts:12`), which is access
  administration;
- portal calls `workRequestPath`, `invoiceCompanyForHours` and `billableRateCents`
  (`portal/lib/work-billing.ts:7`, `agreements.ts:21`, `work-requests.ts:4`), which bill
  contractor work.

**The contractor work-request flow is spread over three entities.** A client requests work and
approves its estimate in the portal (`portal/lib/client-work-requests.ts:7-9`). A contractor
does it through `/work/[token]`, which is a portal route. An admin backstops it from
`company-os`'s operations screens. The client is invoiced by `company-os/lib/client-invoicing.ts`.
The contractor is paid through finance's `contractor_payments`, by `company-os`'s month-end
roll-up (`company-os/lib/contractor-payments.ts`). `portal` owns the two tables,
`contractor_work_requests` and `contractor_work_events`.

**`team`'s two tables have one writer each, both in `team`:**

- `kudos` is a peer wall of thanks that "never counts, sums or ranks a person"
  (`team/lib/kudos.ts:1-8`);
- `performance_reviews` holds review cycles, raters and token links for reviewers outside the
  team (`team/lib/reviews/`). `org`'s Talent screen already opens a cycle through `team`'s door
  (`org/routes/admin/(dashboard)/talent/team/actions.ts:12`).

**Three pages are genuine composites:** the Team Home, the Client Hub and the Admin Home. Each
reads from several owners and writes none of their tables. Route bodies already "sit outside
the door graph and may import any door" (CLAUDE.md, Entities). The Admin Home does exactly that:
its first twenty lines import eleven entity doors
(`company-os/routes/admin/(dashboard)/page.tsx:1-21`).

**Two readers are privacy funnels, not just ownership loopholes.**

- `team/lib/data.ts:1-6` says `teamRead` exists because "a single unscoped query would leak the
  whole company". Its `SCOPE_ALLOWLIST` (lines 32-42) is the scope rule for six tables, and it
  takes `keyof typeof SCOPE_ALLOWLIST` (line 51), not a bare string.
- `portal/lib/data.ts:31-44` (`portalRead`) is the same funnel for client members.

## Decision

1. **Shells live in the kernel, as ADR 0002 said.** What a shell needs from an entity reaches it
   through a slot (ADR 0026):
   - the Team sidebar, chat widget, assume banner and metadata;
   - the Portal sidebar, entitlements and program names.

   `signOut` moves to `kernel/identity`, and the three copies become one. The generator keeps
   installing a shell only when the deployment mounts a page under it, which is the concern
   `SURFACE_LAYOUT_OWNER` answers.
2. **Composite pages stay route bodies.** The Team Home's composite lives in `team`, which the
   manifest marks `kind: "surface"`. `team` is the only surface entity. Existing gates hold it
   to four rules:
   - it owns no tables (`check:table-ownership`);
   - no entity requires it (`check:requires`);
   - its `index.ts` exports no `lib/`;
   - its `lib/` imports no other entity's door, so only its route bodies reach other doors and
     it gains no `requires` edges. The `teamRead` funnel (`team/lib/data.ts`) is the one named
     exception, listed with its reason, and it shrinks as decision 5 retires its rows.

   This is a constraint on an existing entity, not a new kind of module or ESLint zone.

   `company-os` is not a surface entity. Others require it for access administration and work
   billing, so it is an ordinary entity named for its jobs: access administration and the Admin
   Home. The Admin Home is a composite route body inside it, which route bodies may be. Portal
   is not a surface entity either. It owns client membership and the program plans. Only its
   shell moves to the kernel.
3. **A screen that writes one owner's tables moves to that owner,** as ADR 0002 required. A page
   is a composite only if it reads from two or more owners and writes none of their tables.
   Three moves follow:
   - **`kudos` and `performance_reviews` move to `org`.** `org` owns Talent, surveys and core
     values. The review screens under `team/lib/reviews/` and the kudos wall become `org` screens
     under `routes/team/`, the way time-off serves two surfaces. If `org` is split (backlog H4),
     they go with Talent.
   - **The contractor work-request flow becomes its own entity, `work-requests`.** It owns
     `contractor_work_requests` and `contractor_work_events` and every screen that writes them:
     the client's portal pages, `/work/[token]` and the admin operations screens. It also owns
     client invoicing for hours and the month-end roll-up. It requires `finance`, which keeps
     `contractor_payments`. `portal` and `company-os` lose their contractor code, and portal's
     `requires` edge on `company-os` for work billing goes with it.
4. **A screen over kernel tables belongs to the entity that owns the job, by name in the
   manifest.** This follows ADR 0014's rule that access administration has an owner. Settings →
   Access, access codes, agents and assume stay in `company-os`. The reason is that the manifest
   says so, not that the shell happens to be there.
5. **The privacy funnels stay until they can be retired one row at a time.**
   - `teamRead`, `assertInScope` and `portalRead` keep their scope rules in their own files,
     not in the kernel, which would then have to name `equipment_requests` and
     `onboarding_tasks`.
   - An allow-list row is retired only when the owner's door has a question that takes the
     actor. A test must prove a caller cannot drop the scope.
   - `listEntity` and `countEntity` are not funnels. They take a bare string and have only
     company-os callers, so they retire now (ADR 0029).

## Alternatives rejected

- **A `surfaces/<name>/` directory**, this ADR's first draft. It would add a fourth zone to every
  boundary gate to hold what the kernel and route bodies already hold. The argument for it, that
  "a shell must import entity doors", is answered by the Admin layout, which does not.
- **Keep shells in entities and stop moving screens.** This is the state today, and it is why
  `team` requires 13 entities and owns two tables.
- **Move the funnels into `kernel/data` with typed table unions.** The kernel would name entity
  tables, which is the leak ADR 0026 removes.
- **Retire the funnels in one sweep by spreading the scope into owner doors.** That scatters the
  rule that PR #2120's incident showed must be visible in one place, before each owner has a
  tested replacement.

## Consequences

- The Team and Portal shells gain slots, and `TeamSidebar`, `PortalSidebar` and the assume
  banners move to `kernel/shell`.
- `team` carries the flag only after `kudos` and `performance_reviews` have moved to `org`, and
  `check:table-ownership` then holds it there.
- The catalogue gains one entity, `work-requests` (27 become 28, and 27 again when `site`
  leaves under ADR 0034). Whether `deployments/minimal.json` installs it follows from ADR
  0032's edges, not from this ADR.
- `CONTEXT.md:70` becomes true for the App's surfaces.
- After ADR 0022, the public pages that stay in the App (retreats, proposals, `/docs`,
  `/workflows`, the Front door) still need a frame. Today `app/layout.tsx:110` wraps every page,
  Admin included, in `site`'s `SiteFrame`. A public frame moves to `kernel/shell` before `site`
  leaves (ADR 0034).

## Decided

Khoa decided on 2026-10-29:

1. **Only `team` carries `kind: "surface"`.** This corrects the first draft, which also flagged
   `company-os`. That broke rule 2, because crm and portal require it. Portal stays an ordinary
   entity.
2. **`kudos` and `performance_reviews` move to `org`.** Coaching was rejected: it would gain
   the token links for reviewers outside the team. A new entity for two tables was also
   rejected.
3. **The contractor work-request flow becomes the `work-requests` entity.** Finance was
   rejected: it would gain a public token page and a state machine that clients drive. Keeping
   the flow in portal was also rejected, because portal would then absorb the admin and billing
   pieces.
4. **The `teamRead` funnel is rule 4's one named exception.** This corrects a contradiction
   between rule 4 and decision 5. Dropping rule 4 was rejected, because it is what keeps a
   surface from gaining `requires` edges through its `lib/`.

## What would reopen it

A composite that must write to more than one owner in one action. That is a cross-entity
command, which belongs to the owners' doors or to the bus. If it keeps recurring, the rule that
a surface entity writes nothing is too narrow.
