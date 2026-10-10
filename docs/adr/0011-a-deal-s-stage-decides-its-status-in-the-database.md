# ADR 0011 — A deal's stage decides its status, and the database enforces it

Date: 2026-09-27. Status: accepted.

Records the decision taken while grilling candidate 3 of the 27 September 2026
architecture review (card A.32), because it departs from the precedent set for card
estimates (A.29.2), and a future reader would otherwise either remove the trigger as
redundant with the app or re-propose it for other tables on too little evidence.

## Context

A deal carries a `stage_id` and, beside it, a `status` (open, won, lost) and a `closed_at`.
Only one path kept them together: the board's `moveDealStage`, which derived status from the
stage, logged the move, synced the person's lead and announced `deal.won`. Three others did
not. A rejected handoff set the status to lost and left the deal in an open stage. The
`crm-call-to-proposal` skill closed deals by writing status, stage and `closed_at` in SQL.
The admin chatbot's approved write runs any single SQL statement an admin approves, and its
schema prompt lists the status column.

Production on 27 September held 140 deals whose status and stage agreed, only because every
close so far had gone through the board: there had been no rejected handoff. The drift was
elsewhere: a move to Lost on 21 September has no stage-log row and no audit row, matching
the skill's SQL, and about twelve people's lead disagreed with their deals.

For card estimates Khoa chose an app module plus a guard query over a trigger, with the rule
that a trigger card needs the guard to return a row first (A.29.2). Here the evidence
already exists, and the writers that bypass the app are not accidents but standing tools.

## Decision

**The stage is the truth. A trigger on `company_os.deals` sets `status` from the stage on
every insert and update, sets `closed_at` when a deal enters Won or Lost and clears it in an
open stage, and clears `lost_reason` once a deal is not lost. A second trigger writes one
`deal_stage_log` row for every stage change, taking the mover and a note from two columns
the writer sets in the same statement.** A write to `status` alone changes nothing, whoever
makes it.

The consequences a trigger cannot carry stay in the app, in one module (`crm/lib/deal-close`):
the person's lead, the customer bump on a win, and the `deal.won` announcement. The skill
closes deals through a script that calls that module. The chatbot is refused writes to a
deal's stage, status and close date, because it would skip those consequences.

## Considered options

- **App module plus a guard query**, the A.29.2 shape. Rejected: it leaves both SQL paths
  able to write a lost deal into an open stage, and the guard would only report it after the
  fact. The two SQL paths are tools people use on purpose, not a one-off import.
- **Drop `status` and compute it from the stage in every reader.** Rejected for now: a dozen
  readers across CRM, billing, campaigns and the company-os dashboard read `status`, and a
  derived column kept by the database gives them the same guarantee without the churn.
- **Trigger only, no module.** Rejected: a trigger cannot notify the owner or open the
  client's delivery boards, and those are the consequences a close exists for.

## Consequences

- A rejected handoff is set aside like a demotion, not recorded as a loss, so it stays out of
  the win rate.
- Stage history is complete for every writer from this point, including SQL, and says who
  moved a deal when the writer set the mover; a writer that did not shows as unknown, which
  is itself the signal.
- Reopening this means removing a guarantee the reports rely on and answering why a deal
  may be lost while sitting in an open stage.
