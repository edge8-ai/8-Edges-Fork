// The portal entity's client door (multi-entity design §3, "two doors per
// entity", ME-13). ./index.ts pulls the work-request and token modules and with
// them the service-role Supabase client, and a barrel is bundled whole, so a
// "use client" component may never import it. This file is the other door:
// only browser-safe code is re-exported here (types, constants, pure helpers),
// and scripts/entity-client-doors.test.mjs walks its import graph to prove
// nothing server-only follows it into the browser.
//
// The client-backlog vocabulary the roadmap editors read moved to
// entities/client-programs with RS-04, because it describes that entity's
// tables; those editors take it from that entity's client door now.
// The document row shape, for the admin and team document lists (types are
// erased at build, so a server module's type is safe here).
// The document row shape moved to client-programs with the store (RS-04).
export type { ClientDocument } from "@/entities/client-programs/client";
// This entity's rows in the client portal's navigation (ADR 0002).
export { portalNav } from "./ui/portal-nav";
