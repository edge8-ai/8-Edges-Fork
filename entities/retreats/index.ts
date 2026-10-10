// The retreats entity's front door — the Vietnam experience, my-retreat, the
// reserve and events pages, the private-session booking and the trip/passport
// forms (docs/engineering/2026-09-03-multi-entity-design.md, ME-06).
//
// Everything another entity or app/ is allowed to reach lives behind this file;
// the boundary zones in eslint.entities.mjs enforce that. The old
// `@/lib/events`, `@/components/experience/*` … shims went with ME-13; this
// file and `client.ts` are the only ways in.
//
// Route bodies (routes/, api/, crons/) are deliberately absent: app/ imports
// those files directly, because Next reads a route's segment config from the
// route file and a page is not a library export.

// Domain
//
// The retreat business itself — private sessions, my-retreat, the experience
// pages — is internal (entities.manifest.json) and is NOT re-exported here.
// Its own routes and api handlers import those modules directly, which is a
// same-entity import and so crosses no boundary. Re-exporting them would put
// them in the barrel that the fork receives without the modules behind it.
export * from "./events";
export * from "./events-server";

// Person media and tickets, shared with company-os and team screens
export * from "./avatars";
export * from "./id-documents";
export * from "./qr";

// UI. These carry "use client"; a server module may re-export them, but a
// client component importing this index would pull the server modules above
// into its bundle, which is why client code takes them from `client.ts`.
// Page furniture (SubpageFrame / PageHeader / Block) — despite living under
// ui/experience/, the legal pages, the unsubscribe page and the admin event
// agenda all render it, so it is portable and stays in the door.
export * from "./ui/experience/Subpage";
export * from "./ui/gallery/PhotoTagPicker";
export * from "./ui/retreat/RetreatAgenda";

// Cross-entity reads and writes of this entity's tables (design §4, ME-13).
export * from "./lib/reads";
export * from "./lib/writes";

// The agenda vocabulary behind the guest itinerary at /my-retreat/[slug] and
// the admin agenda tab: the client-safe types, labels and grouping. It moved
// here from company-os with RS-11, along with the events tables. The reader
// itself (getEventAgenda) has no caller outside this entity, so it stays off
// the door — knip reports an export nothing imports.
export * from "./lib/event-agenda-shared";

// The inbound retreat signup: it records the inquiry and promotes the person to
// a lead, both through crm's door. It moved here from company-os with RS-04
// because the thing being signed up for is a retreat, and billing's private
// checkout route is its one caller.
export { recordRetreatSignup } from "./lib/signups";
