import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FINANCE_TABLES } from "./tables";

// The tables finance owns are declared twice: here, for code that wants the
// list, and in entities.manifest.json, which is what the ownership ratchet
// (scripts/check-table-ownership.mjs) actually enforces. Two copies drift, so
// this pins them together with the manifest as the source of truth.
describe("finance tables", () => {
  it("declares exactly the tables entities.manifest.json gives finance", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../../entities.manifest.json", import.meta.url), "utf8"),
    ) as { entities: Record<string, { tables?: string[] }> };
    expect([...FINANCE_TABLES].sort()).toEqual([...(manifest.entities["finance"].tables ?? [])].sort());
  });

  it("names the finance tables RS-03 moved off company-os", () => {
    // Bookkeeping, kept apart from billing so a client can take money through
    // Stripe without running Edge8's books, or the books without Stripe.
    for (const table of ["invoices", "qbo_connection", "contractor_payments", "vendors", "products"]) {
      expect(FINANCE_TABLES as readonly string[]).toContain(table);
    }
  });
});
