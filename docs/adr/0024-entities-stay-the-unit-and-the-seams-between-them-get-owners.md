# ADR 0024 — Entities stay the unit of the codebase; the seams between them get owners

Date: 2026-10-28, revised 2026-10-29. Status: proposed.

This ADR answers one question: is the entity-oriented design still the right architecture now
that features span many entities? The answer comes from two passes:

- **The architecture pass of 28 October 2026.** Four read-only readers worked over the
  codegraph index of `main` at `28fe91128`.
- **A two-architect review on 29 October.** Claude Opus 5.5 and Claude Fable 5.1 each read the
  code on their own, rebutted each other, and settled every disputed fact by re-reading the
  code. That review corrected this ADR and 0025 to 0031. It also added 0032 to 0034.

ADRs 0025 to 0034 are the decisions this one leads to.

## Context

The design of 3 September (`docs/engineering/2026-09-03-multi-entity-design.md`) and ADRs
0001 to 0005 made the entity the unit of installation. An entity is one folder, one manifest
entry, one set of owned tables and two doors (`CONTEXT.md`, "Entity"). Eight weeks later there
are 27 entities (`replenishment` landed on 29 October), about 355,000 lines under `entities/` and 40,000 under `kernel/`.

**Ownership holds.** No entity names another entity's table in `.from("…")`. A file-level
constant counts as naming it, because the gate resolves it (`check-table-ownership.mjs:351-359`).
`requires` is a DAG. A change that stays inside one entity needs nothing from anyone else. Of
the 1,027 commits that were not merges between 28 September and 28 October, 437 touched one
entity and 321 touched none (docs, migrations, gates).

The exception is a handful of readers that take the table as a runtime name:

- `teamRead` and `assertInScope` in `team/lib/data.ts`;
- `portalRead` in `portal/lib/data.ts`;
- `countEntity` and `listEntity` in `company-os/lib/query.ts`;
- `.from(locator.table)` in `boards/lib/mutation.ts:56`.

ADR 0029 settles them.

**Installation does not hold.** `deployments/minimal.json` is "a client who bought the
Workboard". It installs 11 of the 27 entities: billing, boards, client-programs, company-os,
contacts, crm, finance, htt, ideas, org and portal. `htt` is marked internal. The file's own
comment explains why (`minimal.json:5-7`). Most of the edges that pull these entities in carry
one symbol each:

- boards → crm, for meeting cards (`boards/lib/meeting-cards.ts:7`);
- crm → org, for one survey read;
- portal → htt, for the Human Tokens band.

ADR 0001's "one deployment per client" is a promise the graph does not keep yet (ADR 0032).

**The strain sits between entities.** 269 commits touched two or more entities. The features
growing fastest are of a kind the 3 September design did not have:

- features that react to facts owned by many entities (Quests, Ladders, Notifications);
- pages that compose many entities (the Team Home, the Client Hub, the Admin Home).

The same pattern recurred each time: a decision about a seam was made locally, worked, and was
never recorded, so the next feature made it again differently.

- **How a surface is owned.** `CONTEXT.md:70` says "A surface is not an entity and owns no
  tables". `scripts/gen-app-mounts.mjs:294` binds each shell to an entity (0025).
- **How one entity shows another's work on a page.** Through slots spelled in five places, with
  one provider's vocabulary in the kernel (0026).
- **How events are delivered.** A delivery log and an outbox were added. ADR 0003 had rejected
  them, and the outbox does not retry what the code comments imply (0027).
- **How a reacting entity learns a fact.** This varies. "Held fire" had three definitions in
  three entities until ADR 0023 gave it to Quests, and Ladders still asks Ideas and Boards two
  questions each (0028).
- **Where ownership is enforced, where rules live in the database, and what the fork's database
  holds.** These were decided in a design doc, sixteen triggers and CLAUDE.md, not in an ADR
  (0029, 0030, 0031).
- **When a need is a `requires` edge at all.** Nothing says (0032).
- **Whether the gates the rules lean on actually fire.** One does not (0033).
- **How a second application reaches the database.** ADR 0022 made one (0034).

Not every count above is a fault. Churn is a scope signal, not a stability one. A file that many
commits touch is a point where parallel work meets. That is a coordination cost, not proof of
bad design.

## Decision

**Keep the shape.** edge8-web stays one Next.js codebase over one Supabase project, divided into
entities with two doors, composed by generated registries. No entity becomes a service, and no
entity gets its own database schema. No surface becomes a separately deployed front end, with
one exception: the public marketing pages, which ADR 0022 moves out because they have different
contributors, not because of the build.

**Change what is between the entities.** Each kind of seam gets one owner and one written rule:

| Seam | Owner | ADR |
|---|---|---|
| Which kind of edge a need between entities is | the edge-kind rule | 0032 |
| A surface's shell and its composite pages | the kernel shell, and an entity marked `kind: "surface"` | 0025 |
| One entity's work shown on another's page | a slot, declared by the provider | 0026 |
| A soft effect across entities | the bus, with a delivery log, an outbox, and a replay per subscriber | 0027 |
| A rule two entities both need | the door of the entity that owns the noun | 0028 |
| Who may write a table | the gates, not the database | 0029 |
| A rule every writer must obey | the database (trigger or function) | 0030 |
| What the fork's database contains | the manifest's portability | 0031 |
| Whether a gate enforces what it claims | a test that plants a violation | 0033 |
| A second application reading or writing the database | its own repository and deploy, the service-role key, and the App's endpoints for writes (0034 superseded) | 0022 |

A new seam that fits none of these rows is the signal for a new ADR before the second feature
uses it, not after the fifth.

## Alternatives rejected

- **Services, one per entity or per group.** Every door question would become a network call,
  every event a queue, and every deployment (ADR 0001) several projects for a client to run.
  The coupling the readers found is in rules and composition. A network boundary does not
  remove that kind of coupling; it only makes the copy harder to see.
- **Micro-frontends per surface.** The App's surfaces share the kernel's shell, identity and
  access model (ADRs 0013, 0014). Splitting them would duplicate exactly the kernel the entities
  rely on. The marketing site is not such a surface: it shares none of the three.
- **A schema per entity.** This was rejected on 3 September (`multi-entity-design.md` §4)
  because `people`, `companies`, `team_members` and others are each read by four to six
  entities. That is still true. ADR 0029 records how ownership is enforced instead.
- **Feature folders by surface** (everything on `/team` together). This would reverse ADR
  0002's rule that the owner of a table owns the screens that write it. It would bring back the
  cross-entity writes that rule removed.
- **Split the hub entities first** (meetings out of crm, surveys and goals out of org).
  - A split does not remove the one-symbol edges. The CRM's company page will still want
    invoices whichever entity holds meetings.
  - ADR 0032's rule removes those edges, so it comes first.
  - Org's own cost is its size (26 tables), not its closure (it requires only `ideas`). Its
    split (H4) stays a backlog decision.
  - Meetings out of crm (H3) is the fallback for any edge whose reversal would make a cycle.

## Consequences

- The work is in the seams, not a rewrite. ADRs 0025 to 0034 each name the cards that carry them
  out, and the architecture backlog holds the rest.
- The size of `deployments/minimal.json` becomes the number that says whether the design scales
  to clients. It is measured after each change ADR 0032 asks for.
- `docs/engineering/entities.md` and `CONTEXT.md` are where a reader looks first, and both have
  drifted from the manifest:
  - entities.md lists 7 of the bus's events;
  - `CONTEXT.md:357-359`, `449` and `451` say Coaching, Onboarding and Time Off require Team,
    which none of them does.

  Each ADR below corrects its row.

## What would reopen it

A client deployment that needs one entity scaled or released separately from the rest, or a
team that must own code without working in this repository. Either is a reason to put a network
boundary somewhere, and the seams these ADRs define are where it would go.

ADR 0022 is the first use of the second clause: the marketing site leaves for its contributors.
ADR 0022 is the boundary it gets: its own repository and deploy. The database contract ADR 0034 proposed was superseded.
