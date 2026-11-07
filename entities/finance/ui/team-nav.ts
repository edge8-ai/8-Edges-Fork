// What finance contributes to the team hub's navigation (ADR 0002): Payroll
// and the P&L under Finance. The shell shows each row only to a viewer whose
// access reaches its page: Payroll to the accountant and Super Admin
// (finance.payroll), the P&L to Super Admin (finance.pnl).
import type { NavContribution } from "@/kernel/shell/nav";

export const teamNav: NavContribution[] = [
  { section: null, group: "Finance", order: 30, items: [
    { label: "Payroll", href: "/team/finance/payroll", ico: "₫", icon: "banknote", enabled: true },
    { label: "P&L", href: "/team/finance/pnl", ico: "$", icon: "statement", enabled: true },
  ] },
];
