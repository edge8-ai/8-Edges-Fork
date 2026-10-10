// The Client Programs entity's browser-safe door (multi-entity design §3, "two
// doors per entity"). ./index.ts builds the service-role Supabase client, so a
// "use client" component may never import it; only browser-safe code is
// re-exported here and scripts/entity-client-doors.test.mjs proves it.
//
// The two roadmap editors are the admin's write surface for a client's backlog
// and overview. They are rendered by this entity's own roadmap page and by the
// company 360 and program pages in crm, so they live in ui/ and are reachable
// here rather than by a deep import into a route folder.
export { BacklogAdminEditor } from "./ui/BacklogAdminEditor";
export { OverviewEditor } from "./ui/OverviewEditor";

// The browser-safe half of the roadmap vocabulary: the priority and status
// lists, the row shapes and the two pure helpers the editors call while typing.
export {
  BACKLOG_PRIORITIES,
  BACKLOG_STATUSES,
  PRIORITY_LABEL,
  effectivePriority,
  tokenLabel,
  type BacklogItem,
  type BacklogPriority,
  type BacklogStatus,
  type RoadmapGroup,
} from "./lib/client-backlog";

// The document row shape for the three document lists (types are erased at
// build, so a server module's type is safe on this door).
export type { ClientDocument } from "./lib/client-documents";
// This entity's rows in the Admin shell's navigation (ADR 0002); the
// composition root hands them to the shell for the deployments that install it.
export { adminNav } from "./ui/nav";
