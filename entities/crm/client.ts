// The crm entity's browser-safe door (multi-entity design §3, "two doors per
// entity"). ./index.ts pulls the service-role Supabase client, so a "use
// client" component may never import it; this file re-exports only what is
// safe to bundle for the browser and scripts/entity-client-doors.test.mjs
// walks its import graph to prove it.
//
// The person picker is the piece every other entity's admin screens render —
// issue assignee, equipment custody, leave requests, hiring manager, event
// staff. It is a CRM component because the roster of assignable people is a
// CRM fact, so the screens that render it reach it here rather than by a deep
// import.
export { PersonSelect } from "./ui/PersonSelect";
// The option shape those callers build. `export type` is erased at build time,
// so naming it here drags none of people-options.ts's server imports along.
export type { PersonOption } from "./lib/people-options";
// This entity's rows in the Admin shell's navigation (ADR 0002); the
// composition root hands them to the shell for the deployments that install it.
export { adminNav } from "./ui/nav";
// This entity's rows in the team hub's navigation (ADR 0002).
export { teamNav } from "./ui/team-nav";
