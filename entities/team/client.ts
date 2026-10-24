// The team entity's client door (multi-entity design §3, "two doors per
// entity", ME-13). ./index.ts pulls next/headers and the service-role Supabase
// client, and a barrel is bundled whole, so a "use client" component may never
// import it. This file is the other door: only browser-safe code is re-exported
// here (client components, types, constants, pure helpers), and
// scripts/entity-client-doors.test.mjs walks its import graph to prove nothing
// server-only follows it into the browser.
//
// Like the index, it lists what a client component outside the entity consumes
// today — the leave vocabulary the admin time-off board, the calendar and the
// portal decision queue render — not what might be useful: knip reports an
// export nothing imports. The coaching vocabulary and ladder picker moved to
// entities/coaching with RS-12.

// The review vocabulary and the review history table that coaching's coach
// profile renders inside its own client components (RS-12). Both are
// browser-safe: the labels are constants and the table is a "use client"
// component.
export * from "./lib/reviews-labels";
export { ReviewHistoryTable } from "./ui/ReviewHistoryTable";
// This entity's rows in the Admin shell's navigation (ADR 0002); the
// composition root hands them to the shell for the deployments that install it.
export { adminNav } from "./ui/nav";
// This entity's rows in the team hub's navigation (ADR 0002).
export { teamNav } from "./ui/team-nav";
// The capability rule the team shell filters its navigation on. It sits on the
// door because the composition root resolves the capabilities and the shell
// applies them, so both sides of that handshake are outside this entity.
