# ADR 0030 — A rule every writer must obey lives in the database; its effects stay in the App

Date: 2026-10-28, revised 2026-10-29. Status: proposed. Khoa decided who owns consent on
2026-10-29 (see "Decided").

This ADR generalises ADR 0011 (a deal's stage decides its status in the database). ADR 0011
recorded two triggers. Fourteen more rule-carrying triggers, and several functions that decide,
were added without a record.

Found by the architecture pass of 28 October 2026. The two-architect review of 29 October
widened it from triggers to all rules in the database, and showed that its first example broke
its own rule.

## Context

ADR 0011 put one rule in the database, as two triggers: a deal's stage decides its status, and
each stage move is logged. Since then the database has gained more triggers that carry a rule
rather than stamping `updated_at`, sixteen in production in all:

- **Derived values.** `deals_derive_usd`, and `set_amount_usd_cents` on bookings, orders and
  products. Also `sprints_set_week` and `meetings_normalize_type`.
- **State that follows state.** `deals_stage_decides` and `deals_log_stage_move` (ADR 0011).
  Also `tasks_children_follow_card`, whose migration says it "states the same rule where every
  writer passes" (`20260928090000_tasks_children_follow_card.sql:13-14`).
- **Guards.** Five on reimbursements. A decided claim's items, events and files cannot be
  changed or deleted.
- **Consent.** `no_solicitation_signup_do_not_contact`, attached to `event_registrations` and
  `survey_responses`.

Triggers are only half of the rules in the database. Functions decide too:

- `record_application_decision` decides a hire and writes its outbox row (ADR 0027);
- `append_task_position` places a card atomically;
- `set_deal_positions_in_stage` renumbers a stage.

The reason these rules went to the database is the same each time: the App is not the only
writer. These writers never pass through the TypeScript:

- agents and scripts that run SQL directly;
- the assistant's `chatbot_writer` role, through 213 policies of its own (ADR 0029);
- `edge8-github-app-tracker`, which shares the project;
- since ADR 0022, the marketing site.

A rule written only in TypeScript holds only for writers that go through that TypeScript.

**The consent trigger is the cautionary case, twice over.**

- On 26 September one function attached to two tables read `new.event_id` and
  `new.cohort_slug` in one `IF`. Every survey insert failed for two days.
- The function as fixed still breaks the rule this ADR sets. It writes the kernel's
  `people.do_not_contact`, which is neither the row being written nor a row its owning entity
  owns.
- It also hard-codes `slug = 'eo-melbourne-retreat-2026-10'` (`01-schema.sql:713`). That is a
  one-off campaign rule inside a function the public fork installs.
- Consent itself has no owner. It is two axes on the kernel's `people` table:
  - `do_not_contact`, a blunt "never contact this person at all";
  - `marketing_consent` (subscribed, unsubscribed or never asked), with its `_at` and
    `_source` (`20260818130000_marketing_consent.sql:1-7`).

  Both must pass before a marketing email sends. `updatePeople(patch)`
  (`kernel/identity/writes.ts:33`) accepts any patch, and every writer goes through it or
  around it:
  - crm's contact form sets `do_not_contact`;
  - the unsubscribe route sets `marketing_consent` (`site/api/unsubscribe/route.ts:65-67`);
  - this trigger sets `do_not_contact`;
  - hiring creates its AI panelist with `do_not_contact: true`
    (`hiring/lib/interview-panelist.ts:92`).

  Campaigns reads both.
- Two gaps follow from that:
  - No App path sets `marketing_consent = 'subscribed'`. Every subscriber arrived by SQL or
    import.
  - The Resend webhook records a spam complaint as the email's status
    (`company-os/api/webhooks/resend/route.ts:22`) and leaves consent untouched.

The lesson of 26 September went into CLAUDE.md as a procedure: explain the SQL, then prove it
with an insert on every table the trigger is attached to. There was still no rule for **when** a
rule belongs in the database at all.

## Decision

A rule goes into the database, as a trigger or as a function the App calls, when and only when
all three of these hold:

1. **It must hold for every writer, and the App cannot check it in the same transaction as the
   write.** A rule the App can check inside its own transaction, and that no other writer
   touches, stays in TypeScript. "It must hold for everyone" alone is true of almost every
   invariant.
2. **It reads and writes only the row being written, or rows the same entity owns.** It never
   writes another entity's table, and never a kernel table. Those writes are a command through
   the owner's door, or an event on the bus.
3. **It is a value, a state transition or a refusal, not an effect.** Sending a message,
   publishing an event, and calling a model or an outside service all stay in the App. When a
   database-decided fact needs an effect, the function writes the event to the outbox in the
   same transaction (ADR 0027), and the App delivers it.

A rule in the database names no particular row, event or campaign by its slug or id. A rule
that applies to one event is that event's configuration, held in a column the rule reads.

The App keeps its own copy of the rule in two cases only:

- the user needs an answer before the write;
- the App must act on the result in the same request. For example, `boards/lib/land-card.ts`
  moves the children and publishes the event.

The database is the authority. The App's copy is named as a preview or a mirror of it, never as
the place the rule is decided.

A trigger function is attached to one table. A rule two tables share is either two functions,
or one function that reads only columns every attached table has. Either way it is proven by an
insert into each table in a rolled-back transaction (CLAUDE.md, Database changes, point 4).

## Alternatives rejected

- **All rules in TypeScript.** It is the obvious path. It is wrong for this project because four
  kinds of writer never run the TypeScript.
- **All rules in the database.** Effects in triggers would send messages from inside a
  transaction that may roll back. They would also hide behaviour from the code that reviewers
  read.
- **Triggers only, functions decided case by case.** A function that decides a hire is as much
  a rule in the database as a trigger, and it is invisible to the gates in the same way.
- **Decide each case on its merits, as now.** Sixteen triggers were decided that way, each with
  its own argument. The one ADR that exists sets an evidence test that nobody else applied.

## Consequences

- **The consent trigger is a defect, not an example.** Its card moves the `do_not_contact` write
  into the kernel's identity writer, as a named consent command that records who asked and why.
  The Melbourne slug becomes configuration on the event. Retreats and org call that command.
- **Each remaining rule is checked against the three conditions on a card.** That covers the
  other fifteen triggers and the deciding functions. Any rule that writes another entity's
  table, or carries an effect, is moved.
- **A rule in the database is invisible to the type checker and to the gates.** Its tests are a
  rolled-back insert and update on every table it is attached to, run against a copy of
  production's catalogue. db-review reads them.
- **The data dictionary lists the rules on each table:** for every table, the triggers and
  functions that hold rules on it. A reader of the TypeScript can find them there.

## Decided

Khoa decided on 2026-10-29 that **the kernel's identity package owns consent.**

- Both axes stay on `people`.
- One named command in `kernel/identity` is their only writer. It takes the person, the axis,
  the value, the source and the actor, and writes an `audit_log` row for each change.
- `insertPeople`, `updatePeople` and `upsertPeople` (`kernel/identity/writes.ts:32-35`) refuse
  the consent columns, so no App writer can go around the command. A new row takes the
  defaults, and a system row such as hiring's AI panelist calls the command after the insert.
- The command covers App writers only. Every subscriber so far arrived through SQL or an import,
  which goes around TypeScript. Whether recording a consent change is a rule every writer must
  obey, and so a trigger that writes the audit row, is checked against this ADR's three
  conditions on the same card.
- Every writer moves onto the command: crm's contact form, unsubscribe (which campaigns owns
  after ADR 0034), the retreat sign-up rule and hiring.
- **Campaigns owns only the rule over the two axes**, "may this marketing email send". It
  never writes them.
- **The two gaps become cards, not part of this ADR.** One is a way for a person to subscribe.
  The other is whether a spam complaint unsubscribes. Each is a consent change that the
  command will record once it exists.

Rejected:

- **`contacts` owns it.** That would need a table move and a migration, only to give consent
  an entity. The kernel already owns `people` and its writers.
- **`campaigns` owns it.** crm's do-not-contact and hiring's system rows would then depend on
  campaigns.

## What would reopen it

Every writer of the database going through one API that this repository owns. The rules could
then live in that API, and the database could go back to storing.
