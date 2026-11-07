// The onboarding entity's browser-safe door (design §3, "two doors per
// entity"). ./index.ts pulls the service-role Supabase client, so a "use client"
// component may never import it; only browser-safe code is re-exported here and
// scripts/entity-client-doors.test.mjs walks this file's import graph to prove
// it. Nothing outside the entity consumes it yet — the cycle board is a server
// component the admin page renders through the server door — so it is empty.
export {};
// This entity's rows in the Admin shell's navigation (ADR 0002); the
// composition root hands them to the shell for the deployments that install it.
export { adminNav } from "./ui/nav";
// This entity's rows in the team hub's navigation (ADR 0002).
export { teamNav } from "./ui/team-nav";
