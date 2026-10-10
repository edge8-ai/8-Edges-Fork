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

// AR modules (design §2): each is reached only through its own index.
// The client hub: what a team member sees of the clients they are assigned to.
// It was the last module under modules/ and folded into lib/ with RS-12, which
// retired that directory; coaching and onboarding became their own entities.
export * from "./lib/hub";

// Entity-wide domain: the member's own data and scope, boards, hiring panels,
// interview kits, equipment, the sign-in link, performance reviews and their
// scheduler, role families and the contractor emails.
export * from "./lib/boards";
export * from "./lib/data";
export * from "./lib/equipment";
export * from "./lib/family-screen";
export * from "./lib/hiring";
export * from "./lib/interview-kit";
export * from "./lib/review-scheduler";
export * from "./lib/review-summary";
export * from "./lib/reviews";
export * from "./lib/reviews-labels";
export * from "./lib/reviews/transcript";
export * from "./lib/reviews/requests";
export * from "./lib/reviews/talent";
export * from "./lib/reviews/chat-tool";
export * from "./lib/role-families";
export * from "./lib/signin-link";

// UI. These carry "use client"; see the caveat above.
export * from "./ui/AvatarUpload";
export * from "./ui/DeviceArt";
export * from "./ui/DirectoryTable";
export * from "./ui/GalleryBrowser";
export * from "./ui/IdUpload";
export * from "./ui/OnboardingWalkthrough";
export * from "./ui/ReviewHistoryTable";
export * from "./ui/StartHerePanel";
export * from "./ui/TeamChatWidget";
export * from "./ui/TeamSidebar";
// The two the composition root needs to decide which nav rows this member sees.
export { hasClientAssignments } from "./lib/hub-clients";
// Which clients a member is assigned to: the weekly status page (client-programs)
// offers its way back into the hub only to them.
export { getActorClientCompanies } from "./lib/hub-clients";
export { isHiringManager } from "./lib/hiring";

// Cross-entity writes to this entity's tables (design §4, ME-13).
export * from "./lib/writes";

// The company goals roll-up the org admin page and the /team page both render.
export { getCompanyGoals } from "./lib/company-goals";

// What this entity tells the access resolver (ADR 0013): the Hiring manager role
// and the clients a person is assigned to. The composition root registers it (app/access.ts).
export { accessContributions } from "./lib/access-contributions";
