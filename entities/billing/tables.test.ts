import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BILLING_TABLES } from "./tables";

// The tables billing owns are declared twice: here, for code that wants the
// list, and in entities.manifest.json, which is what the ownership ratchet
// (scripts/check-table-ownership.mjs) actually enforces. Two copies drift, so
// this pins them together with the manifest as the source of truth.
describe("billing tables", () => {
  it("declares exactly the tables entities.manifest.json gives billing", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../../entities.manifest.json", import.meta.url), "utf8"),
    ) as { entities: Record<string, { tables?: string[] }> };
    expect([...BILLING_TABLES].sort()).toEqual([...(manifest.entities.billing.tables ?? [])].sort());
  });

  it("names the revenue tables the design doc assigns to billing", () => {
    // Design §4: orders, token_purchases, affiliate_*, subscriptions, and since
    // ME-13 bookings (billing is its only writer). affiliates and products went
    // to company-os, whose admin screens are their only writers.
    for (const table of ["affiliate_commissions", "bookings", "orders", "subscriptions", "token_purchases"]) {
      expect(BILLING_TABLES as readonly string[]).toContain(table);
    }
  });
});
