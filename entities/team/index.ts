// The team entity's front door — the /team workspace: the client hub, time
// off, performance reviews, hiring panels, equipment and
// the team assistant route (docs/engineering/2026-09-03-multi-entity-design.md,
// ME-11).
//
// Everything another entity or app/ is allowed to reach lives behind this file;
// the boundary zones in eslint.entities.mjs enforce that. What company-os
// and portal consume today — the leave vocabulary, the review engine, the
// contractor emails and the hub panels — resolves through this file only; the
// old `@/lib/...` and `@/components/...` shims went with ME-13.
//
// This is a server-only barrel: the modules below build the service-role
// Supabase client at load. A client component may take a *type* from it; the
// handful that need a value (the admin time-off board, the portal decision
// queue, the hub bands) import the client door, `@/entities/team/client`.
//
// Route bodies (routes/, api/, crons/) are deliberately absent: app/ imports
// those files directly, because Next reads a route's segment config from the
// route file and a page is not a library export.

// team is a surface entity (ADR 0025): its door exports no lib/ but the one
// named privacy funnel, and its lib/ and ui/ reach no other door. What it held
// moved to the owners with A.88: the hiring board to hiring, company goals to
// org and coaching, the gallery to retreats, the own-service writes to each
// owner, the client hub's program view to portal and who is assigned to which
// client to contacts. The hub, the home and the chat compose them in route
// bodies.

// The privacy funnel (scripts/surface-baseline.json `funnels`): teamRead and
// the member's own data, kept in one place because a single unscoped query
// would leak the whole company (PR #2120).
export * from "./lib/data";

// UI. These carry "use client"; see the caveat above.
export * from "./ui/AvatarUpload";
export * from "./ui/DeviceArt";
export * from "./ui/DirectoryTable";
export * from "./ui/IdUpload";
export * from "./ui/OnboardingWalkthrough";
export * from "./ui/StartHerePanel";


