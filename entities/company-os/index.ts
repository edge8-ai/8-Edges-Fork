// The company-os entity's front door — what is left of the original /admin
// Company OS after the pluggable-entity slices took the rest: operations
// (contractors, vendors, gallery, analytics), settings, the admin shell and the
// QuickBooks ledger plumbing. CRM went to entities/crm (RS-04), the events
// surface to entities/retreats (RS-11), and the company itself — directory, org
// chart, goals, values, equipment, surveys — to entities/org (RS-09).
//
// Another entity may reach company-os only through this file (design §3 rule
// 2). It is a server-only barrel: the modules below build the service-role
// Supabase client at load, so a "use client" file takes what it needs from
// ./client.ts. Nothing that reads an auth session belongs here at all.
//
// Route bodies (routes/, api/, crons/) are deliberately absent: app/ imports
// those files directly, because Next reads a route's segment config from the
// route file and a page is not a library export.

// --- portal: contractor work requests (ME-09) ------------------------------
// The portal owns contractor_work_* and drives the state machine, but the
// status vocabulary, the admin-side path a notification links to and the QBO
// billing step are company-os's.
export {
  WORK_REQUEST_STATUS_LABEL,
  formatHours,
  workRequestPath,
  workRequestTone,
} from "@/entities/company-os/lib/contractors";
export type { WorkRequestStatus } from "@/entities/company-os/lib/contractors";
// Invoicing a client company for hours (QBO + the invoices ledger); the
// work-request half of billing is portal's (Q2).
export { billableRateCents, invoiceCompanyForHours } from "@/entities/company-os/lib/client-invoicing";

// --- the admin list engine -------------------------------------------------
// The paged, filtered, sorted read every admin shelf is built on. It belongs to
// the shell rather than to any one screen, which is why the org and crm shelves
// take it from here.
export { listEntity, countEntity } from "@/entities/company-os/lib/query";

// --- the client cards strip ------------------------------------------------
// The client-company summary strip the team hub and the admin client-hubs page
// both render.
export { ClientCards } from "@/entities/company-os/ui/ClientCards";
export { AssignedStaffCard } from "@/entities/company-os/ui/AssignedStaffCard";
// The dedicated-staff block on a team member's admin page, which org renders.
export { AssignmentsBlock } from "@/entities/company-os/ui/AssignmentsBlock";

// --- the managed-agent register --------------------------------------------
// One pane over every scheduled routine we run, read by Settings -> Agents and
// by org's nightly key-result sync so it can name the routine that wrote a
// number.
export { loadAgentManagement } from "@/entities/company-os/lib/agent-management";

// Shared admin vocabulary other entities' screens use: the country list their
// edit forms offer, the dashboard maths their metric strips share, and the site
// analytics the revenue and marketing cockpits frame their numbers with.
export * from "@/entities/company-os/lib/countries";
export * from "@/entities/company-os/lib/dashboard-helpers";
export * from "@/entities/company-os/lib/vercel-analytics";

// --- the Admin shell's composition (RS-14) ---------------------------------
// The sign-out action the composition root hands the kernel shell. It is
// company-os's because this entity owns the admin session; the shell names no
// entity, so app/ passes it in.
export { signOut } from "@/entities/company-os/lib/actions";
// What this entity answers the global search with (S.1); app/search.ts composes it.
export { searchContributions } from "@/entities/company-os/lib/search";

// --- handing a person a role (AC.18) ---------------------------------------
// The one grant rule Settings -> Access and the team invite share: who may
// grant what, the write, and the audit row. The invite lives in crm and lists
// the roles its form may offer.
export { grantRoleTo, loadGrantableRoles } from "@/entities/company-os/lib/access-grant";
export type { GrantableRole, GrantOutcome } from "@/entities/company-os/lib/access-grant";
// The QuickBooks invoice mirror, for Finance's invoices screens (AE.3): the
// connection and the sync stay with the QuickBooks code here, the screens and
// their atom moved to finance.
export type { QboEntity } from "@/entities/company-os/lib/qbo";
export { getQboInvoiceCustomerId } from "@/entities/company-os/lib/qbo-invoice-customer";
export { syncQboInvoices } from "@/entities/company-os/lib/qbo-invoice-sync";
