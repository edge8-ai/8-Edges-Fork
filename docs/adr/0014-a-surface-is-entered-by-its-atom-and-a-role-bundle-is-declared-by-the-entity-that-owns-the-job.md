# ADR 0014 — A surface is entered by its atom, and a role bundle is declared by the entity that owns the job

Date: 2026-10-08. Status: accepted. Follows ADR 0013 (access is permissions declared by
entities and bundled into roles). Spec: `docs/engineering/2026-10-07-rbac-entry-bundles-invite-spec.md`,
grilled with the CTO on 2026-10-07 and 2026-10-08.

ADR 0013 said a person enters a surface by holding its enter permission. That line was never
built. The Admin view was entered by holding the Admin grant: `requireAdmin` matched the
signed-in email against the admin register, and so did every other place that asked "is this
an admin" (the sign-in link, the landing after sign-in, the invite refusals, survey identity,
the affiliates refusal, the board digest). The Admin grant is the whole company, so no role a
Super Admin composed could open one Admin page to a contractor accountant. Worse, entering the
Admin view was also the permission for every assistant tool, including read-only SQL over the
whole database, for Assume, for portal invites and for collections, so opening the view to a
narrow role would have handed it all of them. And pay and personal records were gated on the
Super Admin grant by email, not on anything a role could carry.

We decided:

- **A surface is entered by its atom.** The Admin layout requires `surface.admin`, the Team
  layout `surface.team`, through the same `requirePermission` every page uses. "Is an admin"
  everywhere else means "holds `surface.admin`". The Admin role holds it by declaration, so
  every current admin keeps entry with no data change, and any role that carries it enters.
  The Admin and Super Admin roles themselves still come from the grant rows and the bootstrap
  allowlist; they are facts of the register, and the atoms they hold are declarations.
- **Entering is only entering.** A capability that rode on `surface.admin` is an atom of its
  own in the entity that owns it (`assistant.query`, `assistant.write`, `crm.assume`,
  `crm.portal-invite`, `crm.collections`), held by Admin by declaration. Sensitive data is
  `people.pay`, `people.identity` and `finance.expenses`, held by Super Admin by declaration,
  and every data gate that asked "is this email a Super Admin" asks the atom.
- **Seeing and controlling may be two atoms.** A pair is declared as `.view` and `.manage`;
  holding `manage` reaches `view`, and the generator refuses a `manage` with no `view`. A
  control is hidden from someone who may not use it: `<Can>` in a server tree, a `may` prop in a
  client component, and the access gate fails a client component that calls an action without
  the prop. The action's guard stays the rule; hiding is courtesy.
- **A role bundle is declared by the entity that owns the job** (slice 2 of the spec). Each
  entity's `permissions.ts` gains the bundles that make sense for its domain, Accountant in
  `finance`, Admin and Super Admin in the kernel; the generator resolves them against the
  deployment and the access sync seeds each once, never overwriting a row the screen edited.
  The declaration is the starting shape; the database stays the truth, as for holders.

## Why not the alternatives

- **Keep entry by grant and let Admin go to contractors.** Admin is the whole company. The
  accountant needs Finance in the Admin view and nothing else, which only an atom can say.
- **A separate surface for the accountant** (ADR 0012) was rejected in ADR 0013: every Team
  finance page would be built twice, which is what happened with `/team/finance/claims/*`
  while contractors could not enter the Admin view.
- **Bundles as migration rows** make every new kind of person (Recruiter, Client Success, HR
  partner) a data migration or hand work on the Access screen. Bundles in code ship with the
  code that gives them meaning, and a typo is a build failure instead of a role that grants
  nothing.
- **One atom per page with no pairs** cannot describe a manager who may view marketing but not
  change it.

## Consequences

- `requireAdmin` and `getAdminUser` are thin wrappers over `surface.admin`, kept while their
  callers move to the atom each one actually needs. A caller that used them to widen scope (the
  Workboard's admin actor, the QBO routes) widens it for any holder of `surface.admin`; today
  only Admin holds it, and each such caller is reviewed before a non-Admin bundle carries the
  atom (AE.3). `TeamActor.isAdmin` stays the Admin role fact, so a role opened for one job never
  widens what a person sees in Team.
- A new atom is refused to everyone in production until its holder rows exist, because the
  guard reads the database. The rows for AE.1's atoms are seeded by `npm run access:sync`
  before the code that requires them is deployed.
- The view/manage form is three-part (`marketing.campaigns.manage`), which the
  `access_role_permissions.permission` check constraint does not yet admit; the first pair to be
  seeded ships with the migration that widens it.
- 242 client components that call an action predate the `may` prop. They are allowlisted, the
  list only shrinks, and each entity adopts the prop when a role needing the split arrives. No
  existing page is retrofitted by this decision.
