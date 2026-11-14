# ADR 0018 — A door answers questions and performs commands; it never hands out a table

Date: 2026-10-17. Status: accepted.

Records the design of theme H1 of the architecture backlog, decided on 17 October 2026. Card
A.62 wrote it down and built the gate; the H1 owner cards convert the callers, one owner each.

## Context

Each entity's `index.ts` re-exported its `lib/reads.ts` and `lib/writes.ts` wholesale
(`export * from "./lib/reads"`). Those files
hold thin builders such as `selectMeetings(columns)` in `entities/crm/lib/reads.ts`, which
return the raw PostgREST builder with its rows typed `Record<string, unknown>`. Other entities
call them, choose their own columns, chain their own `.eq`, `.in` and `.is` filters, and cast
the rows to types of their own. Measured on main at `c3b52f680` by the first run of
`check:door-helpers`: 180 such builders exist, and 142 of them are called from another entity or
from `app/`, at 483 call sites.

Every consequence of that has already been paid for at least once:

- **The owner's rules are spelled again by each caller.** How a person is found by email, which
  sprint is the current one, which staff statuses count as staff and what a new card looks like
  when it is born were each written out in several entities; cards A.56, A.57, A.58, A.61 and
  A.53 exist to gather them back into their owners.
- **The owner cannot see who depends on what.** `entities/coaching/lib/sessions.ts` decides
  what a coaching session is by filtering crm's `meetings` on `source` and on
  `metadata->>source_meeting_type`. Nothing in crm says that this meaning exists or that
  coaching relies on it.
- **A renamed column still compiles in the caller,** because the caller's column list is a
  string and its rows are cast. `audit:parity` exists because the type checker cannot catch a
  filter dropped or a column renamed in a move.
- **The table-ownership gate counts the read as the owner's own.** The `.from(...)` sits in the
  owner's file, so `check:table-ownership` passes while the coupling it was built to measure
  stays exactly where it was.

One entity already has the shape we want: `entities/reimbursements` keeps 22 raw builders, and
none of them is called from outside it.

## Decision

An entity's door exports questions and commands, never a table. Its raw builders in
`lib/reads.ts` and `lib/writes.ts` are private to the entity. What `index.ts` and `client.ts`
export are named functions that answer a question or perform an act, each from a file under
`lib/` named for the concept it is about (`lib/meetings.ts`, for example), never from
`reads.ts` or `writes.ts` and never by re-exporting them.

A question names what it answers: `coachingSessions()`, `companiesOfPerson(personId)`,
`openInvoicesForCompanies(ids)`. Callers pass ids, dates and flags. They never pass a column
list and never chain a filter onto the result. A filter that carries meaning, such as a set of
statuses, a kind, whether archived rows count, or a metadata key, lives inside the question.

The owner types the result. It exports the row type (`CoachingSession`) and either selects a
literal column list, so that PostgREST infers the type, or casts once inside the owner. No
caller casts an owner's rows any more.

A read still returns the PostgREST shape. A question resolves to `{ data, error }`, with `data`
an array or a single row, and a count question to `{ count, error }`. The caller keeps deciding
what a failure means, through `mustRows`, `readOr`, `mustCount` or `countOr` (rule 2 of
`CLAUDE.md`), and `check:read-errors` keeps seeing the `const { data, error } = await …` it
looks for.

A write is a command: `recordMeeting(input)`, `attachTranscript(meetingId, transcript)`. It
returns a `Result`, or the `{ data, error }` of the inserted row when the caller needs its id,
and the owner validates its own input.

When callers need different columns of the same rows, the question returns their union as one
row type, unless one caller is plainly asking a different question, which then gets a function
of its own. There is never a `columns: string` parameter and never an open pick of arbitrary
columns. A question over a sensitive table (`people_sensitive`, compensation, bank details) is
the exception to the union: it returns only the columns its callers read today, so that no
caller is handed a column it did not read before.

Converting a caller does not change what it does. Each converted call makes the same query it
made before: the same table, filters, order and limit, the same single-row or count form, and
the same columns or a superset. Where two callers' filters disagree, both behaviours are kept,
as two questions or as a flag, and the disagreement is reported in the pull request rather than
settled silently. Nothing a page shows changes.

Once no outside caller uses a raw builder, the door stops exporting it: the
`export * from "./lib/reads"` and `export * from "./lib/writes"` lines leave `index.ts`. If a
few builders are still called from outside at the end of an owner's card, the door exports
exactly those by name, with a comment naming the card that will remove them.

`npm run check:door-helpers` holds the line. It counts the outside calls of each raw builder
against one baseline file per owner in `scripts/door-helpers-baseline/`, and fails on a rise, on
a builder newly called from outside, and on a count that fell without its file being lowered.
An owner's card ends by lowering its own file, to `{}` or to the leftovers it reported, with
`node scripts/check-door-helpers.mjs --write-baseline <owner>`, and touches no other owner's file.

## Consequences

- Each owner's rules live in one place, and an owner can read its door to see every question
  other entities ask of its tables.
- A column renamed in the owner fails to compile in the owner, where the person renaming it is
  already looking, instead of failing quietly in a caller.
- `check:door-helpers` replaces trust with a number that only goes down. It is textual, like
  `check:table-ownership`; its header lists what it cannot see, chiefly a builder passed around
  as a value rather than called.
- `audit:parity` stays. It compares a move against the commit before it and catches a filter
  dropped while a call site is rewritten, which is exactly the risk each conversion carries; the
  door gate only counts calls and cannot see a changed query.
- `check:table-ownership` becomes more honest as the H1 cards land: once the builders are
  private, a foreign read can no longer hide inside the owner's file.
- Doors grow. A question is a few more lines than a builder call, and an owner gains functions
  that exist for one caller. That is the price of the owner knowing who depends on it.
- Out of scope for H1: moving tables between entities (meetings out of crm, surveys and goals
  out of org) is later work; an owner's internal use of its own builders is untouched; kernel
  tables are reached through the kernel, not a door.

## What would reopen it

A generated, typed data layer that gave every caller the owner's row types and filters without
the owner writing them by hand would make the hand-written questions redundant. Short of that,
an entity whose callers all genuinely need arbitrary column choices over one table would be a
case to raise, not a reason to bring back `columns: string`.
