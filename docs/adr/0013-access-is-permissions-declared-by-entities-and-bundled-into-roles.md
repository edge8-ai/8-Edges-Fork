# ADR 0013 — Access is permissions declared by entities, bundled into roles, scoped by relationships

Date: 2026-10-06. Status: accepted. Supersedes ADR 0012 (outsiders get their own surface),
which lives on the reimbursements branch and is marked superseded when that branch lands.

Access today is "which allowlist table are you in": `admins`, `team_members`, `portal_members`,
each unlocking a whole shell, with five unrelated extras bolted on (`can_view_sensitive`, the
six team-hub capabilities derived from org data, `team_members.permissions`, portal
entitlements, two env allowlists). A manager sees what a non-manager sees, an outsider on the
Workboard would see the whole Team hub, and the visibility rules of Coaching and Hiring are
written inside the `team` entity. We decided on three layers, and that code asks about only
the first:

- A **permission** is the smallest thing a person may do or see, declared in code by the
  entity that offers it, in `entities/<name>/permissions.ts`, with a sentence and the routes
  and actions it covers. The composition root generates `app/permissions.ts` from the
  deployment, the way it generates `app/nav.ts` and `app/events.ts`. The file is not called
  `access.ts` because `entities/boards/lib/access.ts` already is the Workboard's
  board-membership write gate, and two files of one name meaning two things in one entity is
  the drift this design exists to end.
- A **role** is a named bundle of permissions, each with a scope (own, team, clients, all),
  stored in kernel tables (`roles`, `role_permissions`, `role_assignments`) and edited in one
  screen, Settings → Access. A person holds several roles; the result is the union; no role
  subtracts. A permission is never granted to a person directly — a one-person role is made.
  Whoever grants a role must hold it and hold `access.manage`. Every grant is audited.
  ("Hold it" means hold every permission the role carries, at a scope at least as wide:
  read as "be a holder of that role", nobody could grant a new one-person role or a module
  role they had not been given by name. Settled on 2026-10-06 while building AC.17; the
  rule is `kernel/identity/access-grants.ts`, and it also governs adding a permission to a
  role.) A grant
  has no end date: it ends when revoked or when the person's `team_members.status` leaves the
  active set, which already ends every other kind of access. Module roles are named after the
  module they open (Revenue, Operations, Company, Finance), which is how the people granting
  them already talk.
- A **relationship** is a fact the org data already records (reports to, coaches, assigned to
  a client, employed as). It scopes permissions and implies roles — the baseline from
  employment type (full-time, part-time and intern ⇒ Team member; contract ⇒ Contractor) and
  Manager, Coach, Hiring manager from the org relationships — through *impliers* each owning
  entity declares in its `permissions.ts`, because the kernel may not read an entity's table. An
  implied role cannot be revoked by hand.

The three surfaces stay as shells (chrome and IA, ADR 0002); a person enters one by holding its
`*.enter` permission, and the sidebar, global search, the assistant's tools and notifications
are all filtered by the same permission keys as the pages. **Admin** and **Super Admin** become
roles in this model, so `admins` folds into `role_assignments` and the "one register" rule
survives as "one screen". Every shell is closed by default: a route with no declaration fails
`check:access`; an action whose permission no entity declares fails `check:action-auth`; a
matrix test renders every route as every seeded role.

## Why not the alternatives

- **ADR 0012's fourth External surface.** It was chosen because Admin and Team are open by
  default, so a scoped role there would rest on nobody forgetting to tag a page. Once the shells
  are closed by default that reason is gone, and the fourth shell is a second copy of Team
  screens to keep in sync. It also made the accountant a different kind of person. Dave's
  position (6 Oct) is that a contractor *is* a team member — full-time, part-time, intern and
  contract are four types of one thing, all onboarded, all learning the company — who starts
  with a narrower baseline and is handed modules like anyone else. So there is no Outsider: the
  accountant is a **Contractor** by employment type, invited through the ordinary team invite
  with a type and roles on the form. A missing permission shows a team member a page naming who
  can grant it; a Contractor's baseline decides whether that page or a 404 is shown to them.
- **Facts only** (derive everything from org data) cannot express "the accountant may pay
  reimbursements"; **permissions only** (a grant row per person per atom) leaves a new manager
  with nothing until someone remembers.
- **Roles in code** would make every "Payroll contractor" a pull request; **permissions in the
  database** would let a typo grant nothing and nobody notice. Atoms in code, bundles in rows.

## Consequences

- Migration is a strangler in three moves: (1) resolver and seeded roles that reproduce today
  exactly; (2) every guard becomes `requirePermission(...)` with no outcome change, which the
  matrix test proves; (3) subtract from bundles one decision per PR, starting with the two
  concrete asks (the Contractor baseline plus Finance and a one-person Reimbursement payer role
  for the accountant, a one-person Reimbursement approver role). The first review in move 3
  is what the Contractor baseline and the Company module contain: Dave would open company
  information to contractors so they learn the company, the CEO's example kept the directory
  and goals from the accountant, and both are rows to decide page by page, not a release.
- `team-nav-gate.ts` and `kernel/identity/revenue-access.ts` are deleted; the kernel names no
  product section and no entity names another's pages.
- `SENSITIVE_VIEWERS` retires; `ADMIN_ALLOWLIST` stays only as the bootstrap that seeds the first
  Super Admin into an empty `role_assignments`.
- Scoping is the one non-mechanical step: a page whose rows should follow a relationship asks
  the actor's id-sets rather than filtering on its own. The 36 Team pages every login sees are
  company-wide by intent; for them the question is which role, not which rows.
- The Portal joins the vocabulary last (Client user role, entitlements as company-held
  permissions) with no client-visible change until then.
