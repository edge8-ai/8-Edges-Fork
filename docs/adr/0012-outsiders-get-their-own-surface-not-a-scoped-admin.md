# ADR 0012 — Outsiders get their own surface, not a scoped admin

Date: 2026-10-06. Status: superseded by ADR 0013 (access is permissions declared by entities, bundled into roles), the same day. Kept as the record of the option rejected there.

The reimbursement plan needs an external contractor (the accountant who pays approved
claims) to see Edge8's Finance work and nothing else. Admin today has no scopes: being an
admin means seeing every one of its pages, and every admin guard asks only "is this an
admin?". We decided outsiders get a **new, green-field External surface**, beside Admin,
Team and Portal, rather than a role-aware Admin.

## Considered options

- **Role-aware Admin, closed by default for scoped roles.** One set of screens, and it would
  also scope insiders. Rejected because Admin is open by default: every page, server action
  and piece of shell chrome (global search, the assistant, *Waiting on you*) was written for
  someone who may see everything, so safety would rest on tagging all of it correctly and
  on nobody forgetting to tag the next page.
- **A Team-view permission** (the `revenue` pattern in `kernel/identity/revenue-access.ts`).
  Rejected because it makes an outsider a team member, which puts them in the directory,
  time off, coaching and every other team surface.
- **Extending Portal.** Rejected because a portal member belongs to a client company and
  sees that client's delivery work, while an outsider here acts on Edge8's own records.

## Consequences

The External surface is closed by construction: a page exists there only if an entity
contributes it, the way entities contribute rows to the other shells (ADR 0002), and an
external user reaches only what they were granted. Most of its screens are **Team screens
served on a second surface**, chosen one by one (profile, inbox, claims, and by grant the
boards they are added to and the Finance queue). This is the way Revenue is served on Admin
and Team, so a Team feature appears on External only when its owning entity opts in.

People reach it by **invitation**: an Admin sends a link, the person signs themselves up
through it, and an Owner sets their grants and an optional end date. Someone who signs up
without a link waits, seeing nothing, until an Owner approves them. External has its own
sign-in page, and the other three sign-ins are unchanged.

Which surface a person uses is an access decision, not their employment type. The team
members on `contract` employment stay on Team, and the surface is called External rather
than Contractor so the two are not confused. Scoping *insiders* within Admin is a separate
question this does not answer.
