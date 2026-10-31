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

// The questions and commands other entities may put to billing's tables (A.69,
// ADR 0018). The raw builders this door used to re-export are gone: nothing
// outside billing chooses its own columns or filters on these tables any more.
export * from "./lib/orders";
export * from "./lib/token-purchases";
export * from "./lib/bookings";
export * from "./lib/subscriptions";
export * from "./lib/affiliate-commissions";
// The personPurchases slot (slots.ts): a contact's orders and bookings on
// crm's contact page (ADR 0032).
export { personPurchases } from "./lib/person-purchases";
export type { PersonPurchases, PersonPurchasesSlot } from "./slots";
