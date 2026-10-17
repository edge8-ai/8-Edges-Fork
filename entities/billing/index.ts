// The billing entity's public surface: Stripe checkout, the Stripe webhook,
// and the Svix signature scheme Resend signs its webhooks with.
//
// Design §3 rule 2: another entity, and app/, may import billing only through
// this file. The routes and API handlers under routes/ and api/ are composed
// by the thin files in app/; everything else about the entity stays private —
// the webhook secret is read only by billing's own webhook route, and the
// fulfilment steps only by it, so neither belongs here. The tables billing
// owns are declared in ./tables.ts and in entities.manifest.json.
//
// This surface grows when a call site needs it, not in anticipation: knip
// reports an export nothing imports, which is what keeps the door narrow.

export { stripe } from "./stripe";
export { readSvixHeaders, verifySvixSignature } from "./svix";
export { settledAs, type CommissionSettlement } from "./lib/commission-settlement";

// Cross-entity reads and writes of this entity's tables (design §4, ME-13).
export * from "./lib/reads";
export * from "./lib/writes";
