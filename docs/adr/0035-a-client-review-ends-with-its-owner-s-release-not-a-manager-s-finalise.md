# ADR 0035 — A client review ends with its owner's release, not a manager's finalise, and it is a cycle on a framework rated through personal links

Date: 2026-11-11. Status: accepted. Follows ADR 0013 (access is permissions declared by
entities). Amended 2026-11-13: signing in is a second way in for the client's raters, and the
database holds the lock and release apart (see the amendments below).

Records the decisions of the client reviews spec
(`docs/engineering/2026-11-10-client-reviews-spec.md`), settled in the design review of 10 November
2026. Card CR.3.7. The vocabulary is the Org glossary's (`entities/org/GLOSSARY.md`): framework,
client review, client manager, skip-manager, cycle, HR summary, release, manager of record.

## Context

The company's own reviews (probation, mid-year and renewal) have a self part and a manager part.
The manager of record drafts their part blind, and their own finalise is what shows the review
to the member. The person who rates is the person who ends the review.

A client now reviews the team members placed in its team, twice a year, on its own form. Four
people have a part in it:

- The member rates themselves.
- Their client manager rates them. The client manager is a contact of the client, and needs no
  account.
- The skip-manager reads every review and may comment on the client manager's answers. They
  rate nobody.
- One person in operations runs it and prepares each member's 1-1. This record calls that
  person the owner.

Two facts shape the decision:

- The client's contacts are flagged do-not-contact. The app must never email, message or notify
  them.
- The member must not read the client manager's ratings before the skip-manager has read them
  and the owner has prepared the 1-1.

The existing reviews fit neither. Their reminders email outside raters, and their ending belongs
to the person who rated.

## Decision

1. **A client review is a new type of the existing review rows, not a separate feature.** The
   one table of review parts holds it. A person's history, the team page and the assistant's
   "my reviews" tool keep one source.
2. **It is a cycle that runs a framework.** A cycle is one holding of the review: the members,
   each one's client manager, and the skip-manager. A framework is a named pair of forms and a
   scale. It belongs to no client, and a cycle picks one.
3. **The client manager and the skip-manager each get a rater kind of their own.** Each reaches
   their part through a personal link. The owner copies the link into their own email, and the
   app sends nothing to either of them.
4. **A part locks when it is submitted.** Nobody edits another person's answers. Only the owner
   can reopen a part, and the reopening is recorded.
5. **The review ends when the owner releases it to the member.**
   - Release is given per member. It waits for the client manager's part and for the
     skip-manager's Reviewed mark, which the owner may waive for one member.
   - Until release, only review admins see the review. The member sees their own part.
   - After release, the member, their manager of record and their coach see both parts, both
     averages and the HR summary.
   - The skip-manager's comments stay with review admins, before release and after it.

The owner is whoever opened the cycle. Any other review admin may act on it, so that a review
does not stop while one person is away.

## Alternatives rejected

- **A separate feature with its own tables and screens.** It duplicates history, the team page
  and the assistant's "my reviews" tool. A placed member's record would then live in two places,
  and the review their daily work is judged by would be the one the shared history lacks.
- **Reuse the existing "external" rater kind for the client manager.** The nightly reminder and
  the "send link" action both email external raters. Every existing mailing path would reach a
  do-not-contact contact unless someone remembered a filter. A distinct kind keeps those paths
  away by construction.
- **Let the client manager's submit act as finalise, as the manager of record's does.** The owner
  must prepare the 1-1, and the skip-manager must read the review first. The member would see
  the ratings before either had happened.
- **Key the forms to the client company instead of a framework.** The question set reads like a
  standard competency framework, and the company may want to run it for its own teams. Forms
  that belong to one client could not be run for people who have no client.

## Consequences

- Reviews now have two endings. Every screen that asks "is this review finalised?" to decide
  what a member may see must ask a second question for this type: "has it been released?". One
  pure rules module answers both. No screen, command or endpoint works the rule out again.
- The never-contact rule is stated as an invariant, so tests prove it. With a cycle open and
  every part outstanding, no reminder, link action or Inbox request addresses a client contact.
- Averages are computed when read, from the ratings and the framework's rating keys. No average
  is stored, and one exists only when every key has a rating.
- Mid-year reviews stop opening for people who are in a client review, so nobody is reviewed on
  the same months twice. Probation and renewal reviews stay as they are.
- Past cycles are not imported. A client review's history starts with the first cycle held here.
- "Finalise" stays the word for the company's own reviews, and "release" is the word for a
  client review. The glossary keeps them apart.

## What would reopen it

- The client's contacts all signing in rather than using links. The link pages then become a
  fallback. The rule that the app never contacts them stays.
- The company moving its own probation, mid-year and renewal reviews onto frameworks. One kind
  of review would then have two endings for no reason, and "finalise" and "release" should be
  reconciled into one.

## Amendment (2026-11-13, CR.3.6): signing in is a second way in

Decision 3 said the client manager and the skip-manager each reach their part through a personal
link. Since CR.3.6 (PR 2622, with 2626, 2629 and 2631) either of them can also reach it by signing
in to the client portal.

- The sign-in counts only when it is the person the cycle names for that part, and that person
  holds an active portal membership at the cycle's own client (`signedInAt` in
  `entities/org/lib/client-reviews/access.ts`). Revoking their portal access at that client ends
  this way in, even while they can still sign in through another client.
- It is judged by the same rules as the link. Cancelling a link stops the link and not the person;
  naming a different client manager or skip-manager is what takes a part away from someone.
- The portal home lists what waits on them. The app still sends them nothing, so the rule in
  decision 3 that it never contacts them stands.
- The links stay. They remain the way in for anyone without portal access, so the link pages are
  not a fallback and the first reopening condition below is not met.

## Amendment (2026-11-13, CR.3.3): the database holds the lock and release apart

Decisions 4 and 5 were enforced only by the app, which checks and then writes. A release and the
owner reopening one of the same member's parts could cross, and leave a released review with a
part reopened. Two triggers now close that window (migration `20261113120000`, PR 2619): a release
is refused unless the client manager's part is sent and the member's own part is not waiting on a
correction, and a part of a released review cannot be put back to open. The trigger asks for the
parts exactly what `canReleaseMember` asks, so an unlocked review is still released on the client
manager's answers alone.
