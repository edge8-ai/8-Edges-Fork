# ADR 0010 — The next 1-1 is a booking; the suggested date is computed, never stored

Date: 2026-09-27. Status: accepted.

Records the decision taken while grilling candidate 2 of the 27 September 2026
architecture review, so a future reader does not restore a stored "next 1-1" date or a
routine that writes one, on the evidence that a column is cheaper to read.

## Context

A coaching profile carried `next_one_on_one_on`, a date, beside the `coaching_one_on_ones`
rows a person books. Thirteen code paths wrote one or the other independently: the daily
coaching pass, create, skip, hold in writing, move, propose, confirm, the Cadence card,
roster add and the leave subscriber among them. Pages read the date to say when the next
1-1 is; prep, the agenda nudge and "booked" read the row on that date. Nothing kept the two
in step, and three weekday rules were live at once.

On 25 September #1699 stopped the pass booking 1-1s and sending invites (ADR 0009, withdrawn),
but kept it writing the date as a Wednesday guess that always returned a day. Production on
27 September showed what that produces when the guess is indistinguishable from a booking:
every one of twelve dated profiles showed a Wednesday with no booking behind it, while the
pairs' September 1-1s were held on Tuesdays and a Friday (August's had mostly been
Wednesdays: the rhythm is the pair's, and it moves); four people who had never had a 1-1
were given a first date nobody agreed (the same kind of date had been cleared by hand on
17 September); one profile got a 26-day gap on a 14-day cadence. #1699 had also removed the
only writer of `missed_at`, so the missed prompt and *held late* went dark for every later 1-1.

## Decision

**A booked row is the only thing that says when the next 1-1 is. The suggested date is
computed when it is read, from the rows, the cadence and approved leave, and no column
stores it. No routine writes any part of the schedule.** Choosing a day always books it.
*Passed unheld* is a booked row whose day went by, derived rather than stamped; *held late*
is recorded when the coach marks a 1-1 held after its day, because that is a person's own
answer, not a routine's. One module, the 1-1 schedule, owns the reads and the writes. The
terms are in CONTEXT.md: **1-1 schedule**, **Booked 1-1**, **Suggested date**.

## Considered options

- **Store the suggestion, labelled as one.** The pass writes it each morning and pages read
  a column. Rejected: a stored copy of a pure function is a second truth that drifts, and
  the drift is what the 26 September run was. It also keeps a routine writing the schedule,
  the thing #1699 set out to end.
- **Keep the date as the truth and make every date change book a row.** Rejected: every
  guess would have to become a booking, which is the incident #1699 fixed.
- **Keep both and have one module hold them in step.** Rejected: it manages the date-without-
  a-row state instead of removing it.

## Consequences

- With nothing booked, the pages say so: the roster shows "Nothing booked" beside the
  suggestion and a Book it action, and the team hub's 1-1 line stays quiet until someone
  books. On the day this ships that is every profile, because production held no future
  booking.
- A member books directly only for a first 1-1; with history and nothing booked, a member's
  day is a proposal the coach confirms. Without that, "nothing booked" becoming the normal
  state would have let members book into their coach's day every cycle.
- `next_one_on_one_on`, `preferred_weekday` and `missed_at` are retired and then dropped.
  Reopening this means re-adding a column and a writer, and answering again why a guess
  should look like a booking.
