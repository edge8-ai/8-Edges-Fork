// The Finance entity's server door (RS-03, spec
// docs/engineering/2026-09-08-pluggable-entities-spec.md): invoicing, the
// QuickBooks connection, contractor payments, vendors, FX rates, compensation,
// products and expenses.
//
// Finance is deliberately separate from Billing. Billing is the Stripe-facing
// side of taking money — checkout, orders, webhooks — and a client may want it
// without Edge8's bookkeeping, or the bookkeeping without Stripe. Keeping them
// apart is what makes either answer available.
//
// Its admin screens still live in company-os and move here in a later slice;
// what moved first is ownership of the tables and the modules that write them.
//
// The door answers questions and performs acts; it never hands out a table
// (ADR 0018, card A.65). The raw builders in ./lib/reads.ts and ./lib/writes.ts
// are finance's own. Every question below makes exactly the query its caller
// used to build by hand, and the pay ones (compensation, contractor payments,
// payslips) select only the columns their callers read.
export * from "./lib/invoices";
export * from "./lib/invoice-book";
export * from "./lib/products";
export * from "./lib/event-tiers";
export * from "./lib/contractor-payments";
export * from "./lib/compensation";
export * from "./lib/vendors";
export * from "./lib/fx-rates";
export * from "./lib/expenses";
export * from "./lib/qbo-connection";
export * from "./lib/payroll/payslips";
export * from "./lib/invoice-kind";
// The monthly P&L mirrored from QuickBooks: the sync's writes, the page's read,
// and the statement built from them.
export * from "./lib/pnl";
export * from "./lib/pnl-statement";
// The ledger's settlement vocabulary. Finance owns the invoices table, so it
// owns the words: crm's runway asks how much is still collectible and finance's
// own mirror asks which rows could still become a payment, and those are
// different questions that were each spelling their own string literals until
// the S.2/S.8 collision check caught them disagreeing.
export * from "./lib/invoice-status";
// An invoice's value in US dollars: the one rule every revenue sum uses.
export * from "./lib/invoice-usd";
// The payment, stated as a fact on the bus. The QuickBooks mirror that writes
// the ledger lives in company-os, so the announcement is a door export rather
// than something only finance's own code could reach (S.2).
export * from "./lib/invoice-paid";
// What it cost to serve a client, by month: the one door the Revenue hub's
// gross-margin figures read (RF-3). Named exports, not a star: the module's
// INPUT row types carry `person_id` and `team_member_id` as join keys, and a
// star would make those part of finance's public surface. Only the function
// and the shapes a caller has to name cross the door, and none of them has a
// person on it.
export { loadDeliveryCost } from "./lib/delivery-cost";
export type { BilledMix, DeliveryCost } from "./lib/delivery-cost";
// The client-hub invoices panel and its row shape; finance owns invoices (R.2).
export * from "./ui/InvoicesPanel";
export type { HubInvoice } from "./lib/hub-invoice";
