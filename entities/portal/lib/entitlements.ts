// What this client is entitled to see, resolved once per request.
//
// The nav rows a deployment installs are decided by the entity list; which of
// them *this* client sees is decided here, and the shell filters on the keys
// that come back (ADR 0002, RS-14). Every route is gated server-side regardless
// — this only decides what appears in the sidebar.
import type { PortalActor } from "@/kernel/identity/portal-auth";
import { hasAssignedStaff } from "./team";
import { hasInvoices } from "./invoices";
import { adminCompanyScope } from "./roles";
import { hasMeetings } from "./meetings";
import { hasBoard } from "./boards";
import { hasBacklog } from "./backlog";

export type PortalEntitlements = {
  team: boolean;
  timeOff: boolean;
  invoices: boolean;
  users: boolean;
  companyProfile: boolean;
  meetings: boolean;
  board: boolean;
  roadmap: boolean;
  tokens: boolean;
};

export async function portalEntitlements(actor: PortalActor): Promise<PortalEntitlements> {
  // Time Off is visible iff Team is (same scope source: an active staff
  // assignment) — one lookup covers both, per the design doc's entitlement rules.
  const [hasStaff, invoices, meetings, board, backlog] = await Promise.all([
    hasAssignedStaff(actor),
    hasInvoices(actor),
    hasMeetings(actor),
    hasBoard(actor),
    hasBacklog(actor),
  ]);
  const isCompanyAdmin = adminCompanyScope(actor).length > 0;
  return {
    team: hasStaff,
    timeOff: hasStaff,
    invoices,
    users: isCompanyAdmin,
    // Company Profile edits the shared company record, so it follows the same
    // admin-only rule as Users.
    companyProfile: isCompanyAdmin,
    meetings,
    board,
    // Roadmap appears in the nav once the company actually has one.
    roadmap: backlog,
    // Tokens is company-scoped (balances and delivery are per company), so it
    // needs a company in scope; being a member is otherwise the entitlement,
    // same rule as Requests.
    tokens: actor.companyScope.length > 0,
  };
}
