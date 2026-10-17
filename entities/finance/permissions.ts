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
    "finance.payroll": "See every payroll month, each person's lines and the workbook each came from, and upload a new month",
  },
  holders: {
    "finance.expenses": "super-admin",
    "finance.invoices": "admin, revenue",
    // Payroll is pay, so it sits with Super Admin and the accountant who keeps
    // it (Dave, 2026-10-10), and with nobody the Admin role reaches.
    "finance.payroll": "super-admin",
  },
  roles: {
    // The accountant pays approved claims from the company account and keeps
    // the invoices and payroll (Khoa, 2026-10-08; Dave, 2026-10-10). Dave
    // checks and approves claims, so the accountant neither checks nor sees
    // every claim (Dave, 2026-10-10): only the payment runs. The accountant
    // works from the Team view like every other team member, so the bundle
    // carries no surface.admin; Team comes from employment. No assistant: the
    // bundle opens Finance and nothing else.
    "accountant": {
      "name": "Accountant",
      "sentence": "Pays approved reimbursement claims, keeps the invoices and payroll, and the legal entities' registration details, from the Team view.",
      "atoms": "reimbursements.pay, finance.invoices, finance.payroll, org.legal-registration, access.explain, boards.open",
    },
  },
  routes: {
    "routes/admin/(dashboard)/revenue/invoices/page": "finance.invoices",
    "routes/team/(dashboard)/revenue/invoices/page": "finance.invoices",
    // Every payroll month, and one month's lines (PR 3 of the contractor portal plan).
    "routes/team/(dashboard)/finance/payroll/page": "finance.payroll",
    "routes/team/(dashboard)/finance/payroll/[id]/page": "finance.payroll",
  },
  actions: {
    "routes/admin/(dashboard)/revenue/invoices/history-action": "finance.invoices",
    "routes/admin/(dashboard)/revenue/invoices/map-action": "finance.invoices",
    "routes/admin/(dashboard)/revenue/invoices/sync-action": "finance.invoices",
    "routes/team/(dashboard)/finance/payroll/actions": "finance.payroll",
  },
  implies: {},
};
