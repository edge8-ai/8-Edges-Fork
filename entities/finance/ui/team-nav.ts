// What finance contributes to the team hub's navigation (ADR 0002): Payroll
// under Finance. The shell shows the row only to a viewer whose access reaches
// finance.payroll: the accountant and Super Admin.
import type { NavContribution } from "@/kernel/shell/nav";

export const teamNav: NavContribution[] = [
  { section: null, group: "Finance", order: 30, items: [{ label: "Payroll", href: "/team/finance/payroll", ico: "₫", icon: "banknote", enabled: true }] },
];
