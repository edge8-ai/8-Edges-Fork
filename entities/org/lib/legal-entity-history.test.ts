import { describe, expect, it } from "vitest";
import type { AuditEntry } from "@/kernel/audit/history";
import { legalEntityChange, representativeIds } from "./legal-entity-history";

function entry(over: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: "a1",
    at: "2026-10-08T03:00:00.000Z",
    operation: "update",
    actor: "Dana Example",
    context: { reason: "From the registration certificate" },
    oldData: {},
    newData: {},
    ...over,
  };
}

const VN = { country: "VN" };
const US = { country: "US" };

describe("legalEntityChange", () => {
  it("reads a first tax code as set", () => {
    const change = legalEntityChange(entry({ oldData: { tax_id: null }, newData: { tax_id: "0101234567" } }), VN);
    expect(change).toEqual({
      id: "a1",
      lines: ["Tax code set to 0101234567"],
      who: "Dana Example",
      at: "2026-10-08T03:00:00.000Z",
      why: "From the registration certificate",
    });
  });

  it("reads a changed tax code as before → after", () => {
    expect(legalEntityChange(entry({ oldData: { tax_id: "0101234567" }, newData: { tax_id: "0101234567-001" } }), VN).lines).toEqual([
      "Tax code 0101234567 → 0101234567-001",
    ]);
  });

  it("names the numbers the way the entity's country does", () => {
    const change = { oldData: { tax_id: null, registration_number: null, jurisdiction: null }, newData: { tax_id: "12-3456789", registration_number: "7654321", jurisdiction: "Delaware" } };
    expect(legalEntityChange(entry(change), US).lines).toEqual(["EIN set to 12-3456789", "State file number set to 7654321", "State of incorporation set to Delaware"]);
    const vn = { oldData: { registration_number: null, jurisdiction: null }, newData: { registration_number: "0101234567", jurisdiction: "Hanoi" } };
    expect(legalEntityChange(entry(vn), VN).lines).toEqual(["Business registration number set to 0101234567", "Province set to Hanoi"]);
    expect(legalEntityChange(entry(change), { country: "SG" }).lines[0]).toBe("Tax number set to 12-3456789");
  });

  it("names the legal representative, and says so when the person cannot be found", () => {
    const names = new Map([["p1", "Dana Example"], ["p2", "Lee Sample"]]);
    const change = entry({ oldData: { legal_representative_person_id: "p1" }, newData: { legal_representative_person_id: "p2" } });
    expect(legalEntityChange(change, { country: "VN", personNames: names }).lines).toEqual(["Legal representative Dana Example → Lee Sample"]);
    expect(legalEntityChange(change, { country: "VN", personNames: new Map() }).lines).toEqual([
      "Legal representative a person no longer on record → a person no longer on record",
    ]);
  });

  it("reads the address, date, type, currency and active flag in words", () => {
    const change = legalEntityChange(
      entry({
        oldData: { registered_address: null, incorporated_on: null, entity_type: "llc", base_currency: "usd", active: true },
        newData: { registered_address: "1 Example Street", incorporated_on: "2019-03-14", entity_type: "corporation", base_currency: "vnd", active: false },
      }),
      VN,
    );
    expect(change.lines).toEqual([
      "Type LLC → Corporation",
      "Currency USD → VND",
      "Registered address set to 1 Example Street",
      "Incorporated on set to Mar 14, 2019",
      "Marked inactive",
    ]);
  });

  it("reads a removed value as cleared, keeping what it was", () => {
    expect(legalEntityChange(entry({ oldData: { tax_id: "12-3456789" }, newData: { tax_id: "  " } }), US).lines).toEqual(["EIN cleared (was 12-3456789)"]);
  });

  it("lists every field that changed, in the screen's order, and skips the ones that did not", () => {
    const change = legalEntityChange(
      entry({
        oldData: { tax_id: null, legal_name: "Acme LLC", name: "Acme" },
        newData: { tax_id: "12-3456789", legal_name: "Acme Holdings LLC", name: "Acme" },
      }),
      US,
    );
    expect(change.lines).toEqual(["Legal name Acme LLC → Acme Holdings LLC", "EIN set to 12-3456789"]);
  });

  it("still says something for a row whose fields it does not spell out", () => {
    expect(legalEntityChange(entry({ oldData: null, newData: null })).lines).toEqual(["Updated"]);
    expect(legalEntityChange(entry({ oldData: { color: "red" }, newData: { color: "blue" } })).lines).toEqual(["Updated"]);
    expect(legalEntityChange(entry({ operation: "insert", oldData: null, newData: { name: "Acme" } })).lines).toEqual(["Added"]);
  });

  it("reads a missing actor and a missing or blank reason as absent", () => {
    const change = legalEntityChange(entry({ actor: null, context: { reason: "   " } }));
    expect(change.who).toBe("Unknown");
    expect(change.why).toBeNull();
    expect(legalEntityChange(entry({ context: {} })).why).toBeNull();
    expect(legalEntityChange(entry({ context: { reason: 42 } })).why).toBeNull();
  });
});

describe("representativeIds", () => {
  it("collects every person a page of changes names, once", () => {
    const entries = [
      entry({ oldData: { legal_representative_person_id: "p1" }, newData: { legal_representative_person_id: "p2" } }),
      entry({ oldData: null, newData: { legal_representative_person_id: "p1" } }),
      entry({ oldData: { tax_id: null }, newData: { tax_id: "x" } }),
    ];
    expect(representativeIds(entries).sort()).toEqual(["p1", "p2"]);
  });
});
