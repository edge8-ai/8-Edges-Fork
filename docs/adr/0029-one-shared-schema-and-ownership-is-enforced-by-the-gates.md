# ADR 0029 — One shared schema; table ownership is enforced by the gates, and row security fences every caller that is not the App

Date: 2026-10-28, revised 2026-10-29. Status: proposed. Records a decision taken in the
multi-entity design of 3 September 2026 (§4) that no ADR holds, and says what it leaves to
whom. ADR 0034 applies it to the marketing site.

Found by the architecture pass of 28 October 2026. The two-architect review of 29 October
corrected what the gate sees.

## Context

A reader who sees 218 tables with row-level security enabled and 368 policies in production
will assume the database enforces which entity may touch which table. It does not, and the
reason is a decision, not an oversight.

`docs/engineering/2026-09-03-multi-entity-design.md` §4 chose to "keep one `company_os`
schema". The reason: `people`, `companies`, `team_members`, `orders` and `events` are each read
by four to six entities, and per-entity schemas would each need copies of them. "Instead,
ownership is declared in code (`tables.ts`) and enforced by the ratchet." `htt` keeps its own
schema as the one exception.

Every App path uses the service-role clients in `kernel/data/supabase.ts`, whose key "bypasses
RLS" (line 11). About 670 non-test files under `entities/` and `kernel/` call `.from(`. All 368
policies in production are for the three roles the assistant's SQL runs as: `chatbot_reader`
(65), `chatbot_writer` (213) and `team_chatbot_reader` (90). None is per entity. Row security
therefore fences the model's SQL, not the App.

What enforces ownership is a set of gates that read source text:

- `check:table-ownership`: cross-entity reads are ratcheted and cross-entity writes are refused;
- `check:door-helpers` (ADR 0018);
- `check:entity-imports`;
- the kernel's single writers for identity, audit, interactions and approvals.

`check-table-ownership.mjs` sees more than a literal. It resolves `.from(NAME)` through a
file-level constant, and a name it cannot resolve is a violation in a write
(`check-table-ownership.mjs:351-359`). It has two blind spots, both on reads:

- an unresolved identifier in a read is ignored;
- a member expression such as `.from(locator.table)` (`boards/lib/mutation.ts:56`) is not
  matched at all.

The readers that take a table name at run time:

| Reader | Where | How the table is named |
|---|---|---|
| `teamRead`, `assertInScope` | `team/lib/data.ts:51`, `:155-162` | typed `keyof typeof SCOPE_ALLOWLIST` |
| `portalRead` | `portal/lib/data.ts:31-44` | typed key |
| `listEntity`, `countEntity` | `company-os/lib/query.ts:59`, `:120-125` | bare `string` |
| `.from(locator.table)` | `boards/lib/mutation.ts:56` | member expression |

The first two are privacy funnels (ADR 0025) and must keep working.

The kernel also lists business tables as its own: `companies`, `portal_members` and
`notification_queue` sit in the manifest's `kernel.tables` beside identity and audit.

**ADR 0022, accepted on 25 October, made a second application.** The marketing site, in its own
repository and Vercel project, reads the App's tables with the service-role key and inserts
intake rows (0022:45-53). The first draft of this ADR named exactly that case as its reopen
condition.

## Decision

- **One schema for the company's data, `company_os`, plus `htt`.** No entity gets its own
  schema. A table belongs to the entity whose manifest entry lists it.
- **Inside the App, ownership is enforced in TypeScript, by the gates, before the merge.** The
  database does not know which entity owns a table, and no policy, grant or role per entity is
  added for it.
- **A runtime table name must be one the gate can resolve.** A function may take a table name
  only as a union drawn from a file-level constant, such as `keyof typeof SCOPE_ALLOWLIST`.
  `check:table-ownership` learns to read that union as it reads a constant string. A bare
  `string` parameter is not allowed, so `listEntity` and `countEntity` retire. A member
  expression in `.from(…)` must resolve the same way, or it is a violation.
- **Row-level security fences every caller that is not the App:**
  - the assistant's SQL roles;
  - any role that runs SQL a person or a model wrote;
  - any second application.

  A second application gets its own role, never the service-role key (ADR 0034). Every new table
  is created with RLS enabled and no policy, so those roles see nothing until a policy grants it.
- **Rules every writer must obey, whichever role it holds, live in the database** (ADR 0030).
  The gates cannot see SQL that does not come from this repository.
- **The kernel's own tables are identity, access, audit, events and their logs.** A business
  table in `kernel.tables` is an exception that names its reason in the manifest. Adding one is
  reviewed as making the kernel a shared-data entity.

## Alternatives rejected

- **A schema per entity, with grants.** The 3 September reason still holds. The shared tables
  would be copied, or reached across schemas, by most entities, and every client deployment
  (ADR 0001) would carry the schema graph.
- **RLS per entity under one schema.** The App holds one service-role key, so a policy cannot
  tell which entity is calling. It would need a role per entity and a client per role, which is
  the schema-per-entity cost by another route.
- **Ban every runtime table name.** This would ban the privacy funnels that keep /team and
  /portal scoped (ADR 0025).
- **Trust the doors alone, without gates.** The door rule (ADR 0018) is a convention. The gates
  are what turned it into a number that only goes down.

## Consequences

- A cross-entity write is caught by review and gates, not by the database. Anything that writes
  without passing the gates can write any table that its key allows:
  - a script;
  - an agent's SQL;
  - the sibling `edge8-github-app-tracker`.

  CLAUDE.md's database rules and `db-change-guard` exist for exactly that gap.
- The gates match text, and their headers list what they cannot see. This ADR removes "a table
  named by a runtime value" from that list. ADR 0033 makes the gate prove it.
- Adding a role that runs SQL means writing its policies, table by table. That is the
  assistant's cost, visible in the 368 policies, and it will be the marketing site's.

## The gates' "fires" tests (ADR 0033)

- `check:table-ownership`: `scripts/check-table-ownership.test.mjs`, "the write gate" and "the
  read ratchet", run `checkTableOwnership()`, which the CLI calls, over planted trees. Embedded
  selects, `.from(CONST)`, an unresolved name in a write and a table owned twice are proven only
  in helper tests so far.
- `check:door-helpers`: `scripts/check-door-helpers.test.mjs`, "the command line", spawns the CLI.
- `check:entity-imports`: `scripts/check-entity-imports.test.mjs`, "the gate", all three doors
  included.
- **Prerequisite:** the rule that a runtime table name resolves through a union or a member
  expression has no gate yet, so no fires test. It is written with the gate.

## What would reopen it

The App serving a client's own users directly from the browser with an anonymous or per-user
key. The database would then be the only place ownership can be enforced, for every table those
users reach.
