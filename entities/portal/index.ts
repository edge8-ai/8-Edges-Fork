// The portal entity's front door — the client portal, the proposals index, the
// public survey runner and the /t ticket
// lookup (docs/engineering/2026-09-03-multi-entity-design.md, ME-09).
//
// Everything another entity is allowed to reach lives behind this file; the
// boundary zones in eslint.entities.mjs enforce that. What company-os and
// team actually consume today is the client-facing backlog and document
// helpers and the company-grain
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

// Live AI Program counts per company, for the admin Client Hubs list.
export * from "./lib/program-counts";

// What the kernel's portal shell takes from this entity, as the portal layout's
// slots (ADR 0025): the entitlements that decide which nav rows this client
// sees, the programme names the Delivery group leads with (RS-14), and the
// control that ends an admin's Assume view.
export { portalEntitlements } from "./lib/entitlements";
export { listProgramNamesForActor } from "./lib/ai-programs";
export { endAssumeSession } from "./lib/actions";
// What follows a client's signature on an agreement, which the deal page's
// Retry invoice button runs again (E-signature).
export { invoiceSignedAgreement } from "./lib/agreements";

// The client roles the work-request pages decide by (ADR 0025): who in a client
// may ask for work and decide on it. They are the portal's membership rule.
export { isPortalAdmin, canContribute, ROLE_DENIED } from "./lib/roles";

// The admin shelves' paged lists and counts over this entity's tables, on the
// kernel's pager (ADR 0025: listEntity and countEntity retired).
export { surveyListPage } from "./lib/lists";
