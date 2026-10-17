// The billing entity's client door (multi-entity design §3, "two doors per
// entity", ME-13). Every entity has one so a "use client" component anywhere in
// the tree has a browser-safe path in that never reaches ./index.ts, which is a
// server-only barrel (the Stripe SDK, the webhook secret and the service-role
// Supabase client sit behind it).
//
// Nothing is exported yet: no client component outside the entity consumes
// billing code — checkout starts from a server action and the webhook has no
// UI. The door opens when a caller needs it, not in anticipation; knip reports
// an export nothing imports. scripts/entity-client-doors.test.mjs still checks
// this file, so whatever lands here stays browser-safe.
export {};
