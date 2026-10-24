// The retreats entity's client door (multi-entity design §3, "two doors per
// entity", ME-13). ./index.ts pulls the service-role Supabase client and the
// ticket signer, and a barrel is bundled whole, so a "use client" component may
// never import it. This file is the other door: only browser-safe code is
// re-exported here (client components, types, constants, pure helpers), and
// scripts/entity-client-doors.test.mjs walks its import graph to prove nothing
// server-only follows it into the browser.
//
// What is here is what client components outside the entity consume today: the
// event vocabulary the admin events screens edit, and the people tagger the
// admin gallery manager and the team gallery browser share. knip reports an
// export nothing imports.
export {
  EVENT_STATUSES,
  EVENT_TYPES,
  EVENT_VISIBILITIES,
  tierPriceLabel,
  type EventMedia,
  type EventStatus,
  type EventType,
  type EventVisibility,
} from "./events";
export { PhotoTagPicker } from "./ui/gallery/PhotoTagPicker";
export type { RegistrationStatus } from "./events";
// This entity's rows in the Admin shell's navigation (ADR 0002); the
// composition root hands them to the shell for the deployments that install it.
export { adminNav } from "./ui/nav";
// This entity's rows in the team hub's navigation (ADR 0002).
export { teamNav } from "./ui/team-nav";
