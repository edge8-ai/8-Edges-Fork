// Recruiting on the Admin view (ADR 0013). Super Admins only today: the four ATS layouts call requireSuperAdmin.
// Read as text by scripts/gen-deployment.mjs; nothing imports this file. Every
// atom is held by whoever reaches its pages today, so declaring it changes
// nothing until the guard swap.
import type { EntityPermissions } from "@/kernel/identity/permission-declaration";

/** @generator */
export const permissions: EntityPermissions = {
  permissions: {
    "hiring.ats": "Run recruiting: jobs, applications and candidates",
    // Z.9: every hiring approval (opening a requisition, a shortlist, a hire
    // or a rejection, every message to a candidate) waits on this atom's holders.
    "hiring.approve": "Approve hiring decisions and candidate messages",
  },
  holders: {
    "hiring.ats": "super-admin",
    "hiring.approve": "super-admin",
  },
  roles: {
    // Seeded with these atoms by 20261009200000_hiring_chain.sql; a Super
    // Admin grants it in Settings -> Access to make someone the approver
    // without making them an Admin. hiring.ats is in it because the approver
    // decides on the requisition and application pages.
    "hiring-approver": {
      "name": "Hiring approver",
      "sentence": "Approves opening a requisition, each shortlist, each hire or rejection and every message to a candidate, in the Admin view.",
      "atoms": "surface.admin, hiring.ats, hiring.approve",
    },
  },
  routes: {
    "routes/admin/(dashboard)/talent/applications/page": "hiring.ats",
    "routes/admin/(dashboard)/talent/applications/[id]/page": "hiring.ats",
    "routes/admin/(dashboard)/talent/applications/new/page": "hiring.ats",
    "routes/admin/(dashboard)/talent/candidate-pool/page": "hiring.ats",
    "routes/admin/(dashboard)/talent/candidates/page": "hiring.ats",
    "routes/admin/(dashboard)/talent/candidates/[id]/page": "hiring.ats",
    "routes/admin/(dashboard)/talent/jobs/page": "hiring.ats",
    "routes/admin/(dashboard)/talent/jobs/[id]/page": "hiring.ats",
  },
  actions: {
    "lib/application-actions": "hiring.ats",
    // Z.9: the recruiter proposes (hiring.ats); the approver decides (hiring.approve).
    "lib/chain/actions": "hiring.ats",
    "lib/chain/approve-actions": "hiring.approve",
    "routes/admin/(dashboard)/talent/applications/actions": "hiring.ats",
    "routes/admin/(dashboard)/talent/applications/interview-actions": "hiring.ats",
    "routes/admin/(dashboard)/talent/applications/new/actions": "hiring.ats",
    "routes/admin/(dashboard)/talent/jobs/[id]/actions": "hiring.ats",
    "routes/admin/(dashboard)/talent/jobs/actions": "hiring.ats",
  },
  implies: {},
};
