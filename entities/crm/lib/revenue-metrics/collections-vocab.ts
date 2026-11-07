// The collections vocabulary, alone in a module with no imports (RF-5).
//
// Both sides need it: the server action's Zod enum and the browser form's
// select. `collections.ts` cannot be that home — it reaches the service-role
// Supabase client, and a "use client" file importing it would pull the server
// client into the browser bundle. One list in one pure file is what stops the
// action and the form from offering different vocabularies.
export const CHASE_CHANNELS = ["email", "call", "message", "in person"] as const;
export type ChaseChannel = (typeof CHASE_CHANNELS)[number];

/** After this many days a chase is stale and the row turns amber. */
export const CHASE_STALE_DAYS = 30;
export const COLLECTIONS_KIND = "collections";
