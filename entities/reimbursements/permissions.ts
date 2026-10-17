// Reimbursements' access declaration (ADR 0013; design §1.5). Read as text by
// scripts/gen-deployment.mjs; nothing imports this file. RB.1 declared the
// owner's own claims; RB.3 declared checking them, held by Finance (decided
// 2026-10-07: Finance and the employer only, §4.9 — no Super Admin checks by
// being one). RB.4 declares approving them (the Reimbursement approver), seeing every
// claim without bank details (Admin, §4.2), and deciding your own claim (the
// Employer, §1.6), and adds the Employer to checking, which is how the employer checks.
// RB.6 declares paying: seeing the payment runs with their people's bank
// details and recording payments, held by the Reimbursement payer (the
// bookkeeper also holds Finance, through which they check). Each ticket
// declares the atom its pages need, so each access-rows migration answers one
// decision. The rows for an atom reach
// production as a data-only migration written by `npm run access:sync` from
// this declaration; until they land, its pages refuse everyone.
import type { EntityPermissions } from "@/kernel/identity/permission-declaration";

/** @generator */
export const permissions: EntityPermissions = {
  permissions: {
    "reimbursements.mine": "Submit claims and see your own",
    "reimbursements.check": "Check submitted claims: confirm, send back, reject, decline items",
    "reimbursements.approve": "Approve checked claims",
    "reimbursements.view": "See every claim, without bank details, to help people",
    "reimbursements.decide-own": "Check and approve your own claims, as the employer",
    "reimbursements.pay": "See payment runs with bank details and record payments",
  },
  holders: {
    "reimbursements.mine": "team-member:own, contractor:own",
    // The employer approves and decides their own claims but no longer checks (RB.22, Dave):
    // Finance checks, and a claim under the approval limit is approved by its check.
    "reimbursements.check": "finance",
    "reimbursements.approve": "reimbursement-approver",
    "reimbursements.view": "admin",
    "reimbursements.decide-own": "employer",
    "reimbursements.pay": "reimbursement-payer",
  },
  routes: {
    "routes/team/(dashboard)/claims/page": "reimbursements.mine",
    "routes/team/(dashboard)/claims/new/page": "reimbursements.mine",
    "routes/team/(dashboard)/claims/[id]/page": "reimbursements.mine",
    "routes/team/(dashboard)/finance/claims/to-check/page": "reimbursements.check",
    "routes/team/(dashboard)/finance/claims/[id]/page": "reimbursements.check",
    // The one sidebar row lands here and is sent on to the viewer's first tab (RB.14).
    "routes/admin/(dashboard)/finance/reimbursements/page": "surface.admin",
    "routes/admin/(dashboard)/finance/reimbursements/all/page": "reimbursements.view",
    "routes/admin/(dashboard)/finance/reimbursements/to-check/page": "reimbursements.check",
    "routes/admin/(dashboard)/finance/reimbursements/to-approve/page": "reimbursements.approve",
    "routes/admin/(dashboard)/finance/reimbursements/approved/page": "reimbursements.view",
    "routes/admin/(dashboard)/finance/reimbursements/paid/page": "reimbursements.view",
    "routes/admin/(dashboard)/finance/reimbursements/[id]/page": "reimbursements.view",
    "routes/team/(dashboard)/finance/payment-runs/page": "reimbursements.pay",
    "routes/team/(dashboard)/finance/payment-runs/[id]/page": "reimbursements.pay",
    "routes/admin/(dashboard)/finance/reimbursements/payment-runs/page": "reimbursements.pay",
    "routes/admin/(dashboard)/finance/reimbursements/payment-runs/[id]/page": "reimbursements.pay",
    "routes/admin/(dashboard)/finance/reimbursements/export/page": "reimbursements.pay",
  },
  actions: {
    "routes/team/(dashboard)/claims/actions": "reimbursements.mine",
    "lib/decision-actions": "reimbursements.check",
    "lib/decision-actions#approverDecides": "reimbursements.approve",
    "lib/decision-actions#openClaimFileInAdmin": "reimbursements.view",
    "lib/payer-actions": "reimbursements.pay",
  },
  implies: {},
};
