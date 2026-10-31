// The reimbursements entity's browser-safe door. Only what a "use client" file
// may import; ./index.ts reaches the service-role client and must never reach
// the browser.
//
// This entity's row in the team hub's navigation (ADR 0002): it owns /team/claims.
export { teamNav } from "./ui/team-nav";
// Its rows in the Admin shell's Finance group (RB.4): it owns /admin/finance/reimbursements.
export { adminNav } from "./ui/nav";
