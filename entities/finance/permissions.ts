// Finance's access declaration (ADR 0013, ADR 0014). Read as text by
// scripts/gen-deployment.mjs; nothing imports this file.
//
// finance.expenses is declared before any page needs it, so the sensitive
// atoms come as one set (people.pay, people.identity in the kernel, this one
// here) and Super Admin holds all three by declaration.
//
// AE.3 carved invoices out of company-os.commerce into finance.invoices, so an
// accountant can hold the QuickBooks invoice mirror without products, orders
// and the AIO pad. Its holders are the ones commerce had, so nobody who opens
// invoices today loses them.
import type { EntityPermissions } from "@/kernel/identity/permission-declaration";

/** @generator */
export const permissions: EntityPermissions = {
  permissions: {
    "finance.expenses": "See and record company expenses",
    "finance.invoices": "See the invoices mirrored from QuickBooks, sync them and link a customer to a company",
  },
  holders: {
    "finance.expenses": "super-admin",
    "finance.invoices": "admin, revenue",
  },
  roles: {
    // The accountant checks claims, triggers payment from the company account
    // and keeps the invoices (Khoa, 2026-10-08); Mai and Dave keep their payer
    // grants as the emergency route. No surface.team: Team comes from
    // employment. No assistant: the bundle opens Finance and nothing else.
    "accountant": {
      "name": "Accountant",
      "sentence": "Checks and pays reimbursement claims, keeps the invoices and the legal entities' registration details, in the Admin view.",
      "atoms": "surface.admin, reimbursements.view, reimbursements.check, reimbursements.pay, finance.invoices, org.legal-registration, access.explain, boards.open",
    },
  },
  routes: {
    "routes/admin/(dashboard)/revenue/invoices/page": "finance.invoices",
    "routes/team/(dashboard)/revenue/invoices/page": "finance.invoices",
  },
  actions: {
    "routes/admin/(dashboard)/revenue/invoices/history-action": "finance.invoices",
    "routes/admin/(dashboard)/revenue/invoices/map-action": "finance.invoices",
    "routes/admin/(dashboard)/revenue/invoices/sync-action": "finance.invoices",
  },
  implies: {},
};
