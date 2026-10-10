# ADR 0009 — The app holds the 1-1 in Lark under its own identity, and the app stays the truth

Date: 2026-09-22. Status: withdrawn 2026-09-25.

**Withdrawn.** The Lark holds were removed on 2026-09-25, with the calendar file.
The daily pass had booked 1-1s on its own cadence guess and sent invites for
them, two on days nobody had agreed. There is no calendar integration now: the
app guesses each next 1-1 on a Wednesday and the coach edits it (itself replaced on
2026-09-27 by ADR 0010: only a booking says when the next 1-1 is). The reasoning
below about app identity versus per-coach OAuth still holds if calendar work
comes back.

Records the decision taken while planning K.72, so that a future reader does not
re-propose per-coach OAuth on the evidence the Lark documentation appears to give.

## Context

A coaching 1-1 has never existed anywhere but in our own database. The member could
download a calendar file; the coach got nothing; a meeting moved in Lark never reached the
app. Putting the meeting into Lark raises one question before any other: **whose identity
creates it.**

Two identities are available. The tenant app — which already sends DMs and pulls Minutes
transcripts — acts with a `tenant_access_token` and appears as a bot. A person acts with a
`user_access_token`, which this codebase has never obtained: there is no OAuth route, no
consent screen and no token store.

The documented trade-off favoured per-coach OAuth. `POST /calendar/v4/calendars/:id/events/subscription`
— the push channel that reports a meeting being dragged in the Lark client — is documented
as `user_access_token` only. Without it the app would be writing into a calendar it could
not hear back from, which is half a feature.

**The documentation is wrong, or does not apply to a calendar the app owns.** Probed against
the real tenant on 2026-09-22, that subscribe call returned `code: 0` with the app's own
tenant token. The same probe established that with app identity alone we can create a shared
calendar (`role: owner`), create an event on it with an `idempotency_key`, `PATCH` it, add
attendees, and list events with a `sync_token` that returns exact incremental changes. The
`calendar:calendar` scope was already granted; nothing needed a console change. The one
argument for OAuth evaporated under a single HTTP call.

A second finding reshaped the attendee half. `larkOpenIdByEmail` resolved only 6 of 13
active coaching participants and was read as "the others are not Lark users". They are.
Lark stores two addresses per person, `email` and `enterprise_email`, and the
`batch_get_id` lookup matches only the first; 14 of 43 tenant users have no primary email
at all. A controlled check settled it: 10 users with a primary address resolved 10/10, and
10 users whose address lives only in `enterprise_email` resolved 0/10. So there was never a
coverage problem to design around — there was a broken lookup, which is now its own card
and blocks this work.

## Decision

**The app creates and owns the hold, under its own identity.** A dedicated shared calendar,
named by `LARK_CALENDAR_ID`, holds every scheduled 1-1. The attendees are real Lark users
resolved through the corrected lookup, never email invitees — an in-house 1-1 must not
render as an external meeting.

**The app is the truth about when a 1-1 happens; the hold is made to agree.** A hold that
disagrees with the row is corrected on the next reconcile, and the person who moved it gets
one bot DM saying where the control actually is. A hold deleted in Lark does not cancel the
1-1; it is recreated.

**A decline is the one thing Lark tells us that the app acts on.** It is a fact about
attendance, not about scheduling: it clears the agreed date and reopens the existing
propose-a-day flow. Silence is not a signal — no nudge, no escalation, no meaning attached
to `needs_action`.

**Every message about a hold comes from the bot.** Sending as a coach would need the OAuth
this ADR declines, and would misattribute an action the software took.

## Consequences

The Edge8 app is the organiser of every coaching 1-1 in the company's calendars. That is
accepted deliberately: the cadence cron books most of these, so the bot's name is the honest
rendering of who scheduled the meeting, and a coach's name on it would be a small lie.

Write-back is available two ways — the sync-token poll and the push subscription — and we
owe ourselves no OAuth route, no refresh-token store, and no class of failure where one
coach's revoked consent silently stops their scheduling.

Because `coaching` is a portable entity, this ships to the public fork, where no Edge8 Lark
tenant exists. The whole path is therefore fail-soft on `LARK_CALENDAR_ID` being unset, and
the downloadable calendar file stays until the subscribable-feed card replaces it.

## What would reopen this

- A `calendar.calendar.event.changed_v4` callback that never arrives at our endpoint despite
  the subscribe call succeeding. The poll still works, so this weakens the decision without
  overturning it.
- Lark closing the gap between its documentation and its behaviour, by enforcing user
  identity on subscription. Same answer: the poll survives.
- **The real one:** people finding a bot-organised 1-1 alienating. That is a product
  objection no probe can answer, and per-coach OAuth is the only fix for it. If it surfaces,
  reopen this ADR rather than patching around it.
