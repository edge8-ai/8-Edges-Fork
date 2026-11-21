// What this entity contributes to the team hub's navigation (ADR 0002): the
// member's own claims under Me, and the checker's queue under Finance
// (CONTEXT.md, "Reimbursements"). The rows sit here because this entity owns
// /team/claims and /team/finance/claims; a deployment without it loses the
// links with the pages. The shell shows each row only to a viewer whose access
// reaches its page's declared permission: reimbursements.mine for My Claims,
// reimbursements.check for To Check, reimbursements.pay for Payments (RB.6) and
// Advances (AD.7), whose row waits for advances to open rather than showing Finance
// an empty page.
import type { NavContribution } from "@/kernel/shell/nav";
import { ADVANCES_OPEN } from "../lib/advance-policy";

export const teamNav: NavContribution[] = [
  { section: null, group: "Me", order: 45, items: [
    { label: "My Claims", href: "/team/claims", ico: "₫", icon: "receipt", enabled: true },
  ] },
  { section: null, group: "Finance", order: 10, items: [
    { label: "To Check", href: "/team/finance/claims/to-check", ico: "☑", icon: "clipboardCheck", enabled: true },
    { label: "Ready to pay", href: "/team/finance/payment-runs", ico: "⇄", icon: "transfer", enabled: true },
    ...(ADVANCES_OPEN ? [{ label: "Advances", href: "/team/finance/advances", ico: "₫", icon: "coins" as const, enabled: true }] : []),
  ] },
];
