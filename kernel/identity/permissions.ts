// The kernel's own atoms (ADR 0013): entering each signed-in surface, and
// managing access itself. Every entity may require these; each entity's own
// atoms are its alone. Read as text by scripts/gen-deployment.mjs — see
// ./permission-declaration.ts for the format.
import type { EntityPermissions } from "@/kernel/identity/permission-declaration";

/** @generator */
export const permissions: EntityPermissions = {
  permissions: {
    "surface.admin": "Enter the Admin view",
    "surface.team": "Enter the Team view: what every team member sees",
    "surface.portal": "Enter the client portal",
    "access.manage": "Grant and revoke roles in Settings, Access",
    "access.explain": "Be told which permission a refused page needs and who can grant it",
    // Sensitive data (ADR 0014): its own atoms, so being let into a page is
    // never enough to see pay or personal records on it, and an HR partner can
    // later hold identity without pay.
    "people.pay": "See and change pay: salaries, contractor rates and payments, and the pay fields of reviews and candidates",
    "people.identity": "See and change personal records: ID images, emergency contacts and the restricted personal details",
  },
  holders: {
    "surface.admin": "admin",
    // Contractors see the whole Team view today; AC.19 decides what they keep.
    "surface.team": "team-member, contractor",
    "surface.portal": "client-user",
    "access.manage": "super-admin",
    // The Contractor baseline's flag (AC.16): whoever holds this sees the refusal
    // page, and whoever does not gets a 404. Contractors and clients are left
    // out, so a refused page does not tell them what exists or who to ask.
    "access.explain": "team-member, admin, manager, coach, hiring-manager, revenue, finance",
    "people.pay": "super-admin",
    "people.identity": "super-admin",
  },
  // The two locked bundles (AE.2): Settings → Access grants them but never
  // edits them, so what they carry is this list. It names atoms of every
  // entity in the catalogue; a deployment keeps the ones it installs.
  // scripts/access-declarations.mjs fails the build when a list and the
  // holders above and in each entity disagree. Super Admin holds Admin's atoms
  // through Admin, which every Super Admin also holds, so it lists only its own.
  roles: {
    "admin": {
      "name": "Admin",
      "sentence": "Runs the Admin view.",
      "atoms": "surface.admin, access.explain, assistant.query, assistant.write, boards.admin, boards.manage, boards.open, boards.plan, campaigns.marketing, client-programs.roadmaps, client-programs.status, client-programs.status-release, company-os.agents, company-os.clients, company-os.commerce, company-os.operations, company-os.publish-editor, company-os.quickbooks, company-os.routine-control, company-os.settings, crm.assume, crm.billing, crm.calls, crm.collections, crm.contacts, crm.pipeline, crm.portal-invite, finance.invoices, ideas.manage, library.manage, library.private-workflows, onboarding.manage, org.company, org.operations, org.people, reimbursements.view, retreats.events, retreats.manage, team.company-manage, team.reviews, time-off.manage",
    },
    "super-admin": {
      "name": "Super Admin",
      "sentence": "An admin who may also see pay, personal records and recruiting.",
      "atoms": "access.manage, people.identity, people.pay, company-os.agents, company-os.routine-control, crm.agreements, finance.expenses, hiring.approve, hiring.ats, org.legal-entities, org.legal-registration",
    },
  },
  routes: {},
  actions: {},
  implies: {
    "approver": "has a request waiting on their decision",
  },
};
