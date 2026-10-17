// The site entity's client door (multi-entity design §3, "two doors per
// entity", ME-13). ./index.ts is kept free of Supabase and the filesystem, but
// the content helpers behind the old lib/ shims are not, and a barrel is
// bundled whole; this file is the door a "use client" component uses: only
// browser-safe code is re-exported here (types, constants, pure helpers), and
// scripts/entity-client-doors.test.mjs walks its import graph to prove nothing
// server-only follows it into the browser.
//
// What is here is what the admin gallery manager, the team gallery browser and
// the retreats people tagger — all client components — read of the gallery: the
// category vocabulary and the row shapes, split out of lib/gallery.ts for
// exactly this door. knip reports an export nothing imports.
//
// The broadcast blocks type is here for the broadcast editor (a client
// component in company-os); its module is a zod schema and types, nothing more.

export {
  GALLERY_CATEGORIES,
  type GalleryPhoto,
  type Result,
  type TaggablePerson,
  type TaggedPerson,
} from "./lib/gallery-types";
