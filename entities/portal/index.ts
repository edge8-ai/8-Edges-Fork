// The portal entity's front door — the client portal, the proposals index, the
// public survey runner, the contractor work-token pages and the /t ticket
// lookup (docs/engineering/2026-09-03-multi-entity-design.md, ME-09).
//
// Everything another entity is allowed to reach lives behind this file; the
// boundary zones in eslint.entities.mjs enforce that. What company-os and
// team actually consume today is the client-facing backlog and document
// helpers, the contractor work-request state machine and the company-grain
// token accounting; their old `@/lib/...` shims went with ME-13, and this file
// and `client.ts` are the only ways in.
//
// The browser-safe half sits behind `client.ts` rather than this file on
// purpose: the roadmap editors, the document lists and the hub bands that
// import it are client components, and a client component that reached this
// index would pull the work-request and token modules — and with them the
// service-role Supabase client — into its bundle. The same caveat the retreats
// entity records about its UI exports.
//
// Route bodies (routes/, api/) are deliberately absent: app/ imports those
// files directly, because Next reads a route's segment config from the file in
// app/ and a page is not a library export.

// Client documents: the shared program/document store behind the portal's
// Programs tab, the admin company page and the team client hub.
export * from "@/entities/client-programs";

// Contractor work requests. The portal owns contractor_work_* (design §4), so
// the state machine both the admin actions and the portal helpers drive lives
// here; each caller supplies its own decider and its own guard.
export * from "./lib/work-requests";
// The transition graph itself: which status may follow which, and which actor
// may cause the move. Every write of `status` on contractor_work_requests goes
// through moveWorkRequest, so the admin actions, the portal helpers and the
// contractor's token page share one answer instead of three sets of literals.
export * from "./lib/work-request-lifecycle";
// Contractor work-request notifications (emails to the contractor and the
// client, the ops Lark ping). Portal's since Q2: the requests are portal's
// tables, and team sits above portal in the layer order, so the helpers could
// not stay behind team's door without portal reaching up.
export * from "./lib/contractor-notify";
// The Contractors board: one card per request sent, closed when the request
// closes, and the hours prompt the board shows as the contractor drags it to Done.
export { openContractorCard } from "./lib/contractor-card";
export { reportContractorHours } from "./lib/contractor-card-actions";

// Company-grain human-token accounting — the one place the Bought / Delivered /
// Balance / Planned / leverage formula lives, shared with the admin Client Hub.
export * from "./lib/hub-tokens";

// Live AI Program counts per company, for the admin Client Hubs list.
export * from "./lib/program-counts";

// Cross-entity writes to this entity's tables (design §4, ME-13).
export * from "./lib/writes";
// What the composition root needs to render the portal shell: the entitlements
// that decide which nav rows this client sees, and the programme names the
// Delivery group leads with (RS-14).
export { portalEntitlements } from "./lib/entitlements";
export { listProgramNamesForActor } from "./lib/ai-programs";
// The portal shell's chrome, rendered by the composition root (RS-14). Both
// reach this entity's "use server" actions — the sign-out and exit-assume
// buttons post to them — so they sit on the server door, like team's sidebar,
// and the layout that renders them is a server component.
export { PortalSidebar } from "./ui/PortalSidebar";
export { AssumeBanner } from "./ui/AssumeBanner";
// What follows a client's signature on an agreement, which the deal page's
// Retry invoice button runs again (E-signature).
export { invoiceSignedAgreement } from "./lib/agreements";
