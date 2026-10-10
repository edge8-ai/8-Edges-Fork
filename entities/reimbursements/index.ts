// The reimbursements entity's server door: claims, their checking and approval,
// and the payment runs that pay them back (CONTEXT.md, "Reimbursements"). It is
// its own entity, apart from Finance, because a claim names a trip and Retreats
// already depends on Finance.
//
// What other code may reach today is deliberately small. The lifecycle module
// (lib/claim-lifecycle.ts) moves every claim, and only this entity's own pages
// and crons call it; the helpers behind a transition are not exported, because
// exporting them is how time-off's surfaces came to pick wrong (A.30).

// Cross-entity reads of this entity's tables (design §2.2): thin helpers that
// hand back the builder, as every entity's reads.ts does.
export * from "./lib/reads";
// The owner's own claims, each with its status line: the team assistant's
// my_reimbursements tool reads the same list My claims shows.
export { listMyClaims } from "./lib/my-claims";
// The ProfileClaimsPanel page slot (app/shell.ts): the member's claims on
// their profile, provided when this entity is installed.
export { ProfileClaimsPanel } from "./ui/ProfileClaimsPanel";
// The TripCostPanel page slot (app/shell.ts, RB.12): a trip's paid claims on
// retreats' event P&L, provided when this entity is installed, so retreats
// never names it.
export { TripCostPanel } from "./ui/TripCostPanel";
// The buyer a Vietnamese red invoice must name, read from org's legal
// entities (decision 8): the claim pages show it, and RB.9's receipt reading
// checks an invoice against it. Exported here so the door graph reaches org,
// and the manifest's `requires` says so (check:requires).
export { readRedInvoiceBuyer } from "./lib/red-invoice-buyer";
