// What this entity contributes to the Admin shell's navigation (ADR 0002): the
// Reimbursements rows under Four Offices → Finance (design §2.1). The shell
// owns the slot (kernel/shell/admin-ia.ts); this file names the rows, and the
// shell shows each only to a viewer whose access reaches its page's declared
// permission. One row for claims (RB.14): its page sends each viewer to the
// first of their tabs (To check, To approve, Ready to pay, Paid, All claims),
// which replaced a row each. Payment Runs keeps its own row (.pay, RB.6); the
// month-end Export is a button on the tabs.
import type { NavContribution } from "@/kernel/shell/nav";

export const adminNav: NavContribution[] = [
  { section: "Four Offices", group: "Finance", subheading: "Reimbursements", order: 10, items: [
    { label: "Reimbursements", href: "/admin/finance/reimbursements", ico: "☑", enabled: true },
    { label: "Payment Runs", href: "/admin/finance/reimbursements/payment-runs", ico: "⇄", enabled: true },
  ] },
];
