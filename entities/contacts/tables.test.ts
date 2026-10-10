import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTACTS_TABLES } from "./tables";

// The tables contacts owns are declared twice: here, for code that wants the
// list, and in entities.manifest.json, which is what the ownership ratchet
// (scripts/check-table-ownership.mjs) actually enforces. Two copies drift, so
// this pins them together with the manifest as the source of truth.
describe("contacts tables", () => {
  it("declares exactly the tables entities.manifest.json gives contacts", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../../entities.manifest.json", import.meta.url), "utf8"),
    ) as { entities: Record<string, { tables?: string[] }> };
    expect([...CONTACTS_TABLES].sort()).toEqual([...(manifest.entities["contacts"].tables ?? [])].sort());
  });

  it("names the contact tables RS-01 moved off company-os", () => {
    // Companies and the person-company relationships are what every other
    // entity hangs records off, so they belong to the mandatory entity.
    for (const table of ["brands", "person_companies", "staff_assignments"]) {
      expect(CONTACTS_TABLES as readonly string[]).toContain(table);
    }
  });
});
