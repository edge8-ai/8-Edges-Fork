# ADR 0002 — Surfaces are kernel shells that render entity contributions

Date: 2026-09-08. Status: accepted.

## Context

The admin, team-hub and portal sidebars are hand-written arrays, dashboard cards are inline
JSX, and every one of the 34 imports from Company OS into Team sits in a route body: the
admin surface owns pages that write Team's tables. Route bodies were exempt from the layer
gate to make the entity migration possible, and that exemption is where cross-entity
coupling now hides.

## Decision

A surface (Admin, Team hub, Portal) is a shell owned by the kernel: layout, sidebar, guard,
home. Entities export typed contributions from their client door: navigation items,
dashboard cards, detail-page tabs, pages. The composition root passes the included entities'
contributions to the shell. The entity that owns a table owns every screen that writes it,
so pages move to the entity whose data they edit, and the route-body exemption is withdrawn
for cross-entity writes.

## Alternatives rejected

- Keep the admin dashboard as an entity that imports every other door. It would remain the
  monolith with a new name, and it cannot be excluded or shrunk.
- Self-registering contributions on import. Load order and tree-shaking make that fragile,
  and the door-load-order test exists because it bit us before.

## Consequences

- The kernel gains UI that composes entities without naming them, which keeps the "kernel
  imports no entity" rule intact because registration happens in `app/`.
- A page that edits another entity's data is a smell the gate can now catch.
- Company OS ceases to be an entity; its screens go to their owners and the rest becomes
  several entities.

## Amendment (2026-09-25): search contributions come through the server door

The global search (S.1) is a contribution in this sense: many entities, one shell feature,
composed in `app/` so the kernel names none of them. But unlike navigation it runs queries,
and a query holds a service-role client that must never reach the browser. So an entity
exports `searchContributions` from `index.ts`, its server door, not from `client.ts`.
`scripts/gen-deployment.mjs` composes them into `app/search.ts`, a server-action module
whose per-surface actions guard inline (ADR 0007). The browser receives only those actions,
handed to the kernel's `SearchPalette` by the layouts. The rule this ADR keeps is unchanged:
the kernel defines the contract and composes nothing itself. What changed is only which door
a contribution leaves by, and that follows from where it runs.
