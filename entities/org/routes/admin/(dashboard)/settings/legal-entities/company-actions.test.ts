import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script, timeline } from "@/kernel/data/testing/fake-company-os";

// The company itself: a Super Admin's actions (org.legal-entities) to change
// a legal entity's name, legal name, type, currency or active flag, and to add
// a new one. Each asks for its permission before anything else, refuses a
// change that moves nothing, writes through org's writer and audits the
// values before and after with the reason.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const requirePermission = vi.fn(async (_p: string) => ({ user: { email: "owner@example.test" } }));
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: (p: string) => requirePermission(p) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createLegalEntity, updateLegalEntityCompany } = await import("./company-actions");

const ID = "7d1f0c3e-2b4a-4c5d-8e9f-0a1b2c3d4e5f";
const NEW_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
// Made-up company.
const ROW = {
  id: ID,
  slug: "acme-llc",
  name: "Acme",
  legal_name: "Acme LLC",
  country: "US",
  entity_type: "llc",
  base_currency: "usd",
  active: true,
  tax_id: "12-3456789",
  registration_number: null,
  registered_address: null,
  legal_representative_person_id: null,
  jurisdiction: null,
  incorporated_on: null,
};
const SAME = { id: ID, name: "Acme", legalName: "Acme LLC", entityType: "llc", baseCurrency: "USD", active: true, reason: "Renamed at the annual filing" };
const writes = () => calls.filter((c) => c.ops.includes("update") || (c.ops.includes("insert") && c.table === "legal_entities"));
const audits = () => calls.filter((c) => c.table === "audit_log" && c.ops.includes("insert")).map((c) => c.payloads[0] as Record<string, unknown>);

beforeEach(() => {
  resetFake();
  requirePermission.mockClear();
});

describe("updateLegalEntityCompany", () => {
  it("asks for org.legal-entities before it reads or writes anything", async () => {
    requirePermission.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(updateLegalEntityCompany({ ...SAME, legalName: "Acme Holdings LLC" })).rejects.toThrow("NEXT_REDIRECT");
    expect(requirePermission).toHaveBeenCalledWith("org.legal-entities");
    expect(calls).toHaveLength(0);
  });

  it("writes the changed fields compare-and-set and audits them with the reason", async () => {
    script("legal_entities", { data: [ROW] }, { data: [{ id: ID }] });
    script("audit_log", {});
    expect(await updateLegalEntityCompany({ ...SAME, legalName: "Acme Holdings LLC", active: false })).toEqual({ ok: true });

    const update = calls.find((c) => c.ops.includes("update"));
    expect(update?.payloads[0]).toEqual({ legal_name: "Acme Holdings LLC", active: false });
    expect(update?.filters).toEqual([
      ["eq", "id", ID],
      ["eq", "legal_name", "Acme LLC"],
      ["eq", "active", true],
    ]);
    expect(audits()).toEqual([
      expect.objectContaining({
        operation: "update",
        record_id: ID,
        actor_label: "owner@example.test",
        old_data: { legal_name: "Acme LLC", active: true },
        new_data: { legal_name: "Acme Holdings LLC", active: false },
        context: { reason: "Renamed at the annual filing" },
      }),
    ]);
    expect(timeline()).toEqual(["legal_entities:select", "legal_entities:update", "audit_log:insert"]);
  });

  it("refuses a change that moves nothing", async () => {
    script("legal_entities", { data: [ROW] });
    expect(await updateLegalEntityCompany(SAME)).toEqual({ ok: false, error: "Nothing changed." });
    expect(writes()).toHaveLength(0);
  });

  it("refuses a blank legal name and a short reason", async () => {
    script("legal_entities", { data: [ROW] });
    expect(await updateLegalEntityCompany({ ...SAME, legalName: " " })).toEqual({ ok: false, error: "Registered legal name: Enter the registered legal name." });
    expect(await updateLegalEntityCompany({ ...SAME, legalName: "Acme Holdings LLC", reason: "" })).toEqual({ ok: false, error: "Say why, in at least 5 characters." });
    expect(writes()).toHaveLength(0);
  });

  it("surfaces a failed write and records nothing", async () => {
    script("legal_entities", { data: [ROW] }, { error: { message: "permission denied" } });
    expect(await updateLegalEntityCompany({ ...SAME, name: "Acme US" })).toEqual({ ok: false, error: "Could not save the change: permission denied" });
    expect(audits()).toHaveLength(0);
  });
});

describe("createLegalEntity", () => {
  const NEW = { slug: "acme-sg", name: "Acme Singapore", legalName: "Acme Singapore Pte. Ltd.", country: "sg", entityType: "corporation", baseCurrency: "SGD", reason: "Opened the Singapore office" };

  it("asks for org.legal-entities before anything else", async () => {
    requirePermission.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(createLegalEntity(NEW)).rejects.toThrow("NEXT_REDIRECT");
    expect(requirePermission).toHaveBeenCalledWith("org.legal-entities");
    expect(calls).toHaveLength(0);
  });

  it("inserts the entity and audits it as an insert with the reason", async () => {
    script("legal_entities", { data: [] }, { data: { id: NEW_ID } });
    script("audit_log", {});
    expect(await createLegalEntity(NEW)).toEqual({ ok: true });

    const insert = calls.find((c) => c.table === "legal_entities" && c.ops.includes("insert"));
    const row = { slug: "acme-sg", name: "Acme Singapore", legal_name: "Acme Singapore Pte. Ltd.", country: "SG", entity_type: "corporation", base_currency: "sgd" };
    expect(insert?.payloads[0]).toEqual(row);
    expect(audits()).toEqual([
      expect.objectContaining({ operation: "insert", record_id: NEW_ID, actor_label: "owner@example.test", new_data: row, context: { reason: "Opened the Singapore office" } }),
    ]);
  });

  it("refuses a slug another entity already uses", async () => {
    script("legal_entities", { data: [{ id: ID }] });
    expect(await createLegalEntity(NEW)).toEqual({ ok: false, error: "Another legal entity already uses the address acme-sg. Change the name." });
    expect(writes()).toHaveLength(0);
  });

  it("says the same when the unique index catches a race", async () => {
    script("legal_entities", { data: [] }, { error: { message: "duplicate key value violates unique constraint", code: "23505" } as { message: string } });
    expect(await createLegalEntity(NEW)).toEqual({ ok: false, error: "Another legal entity already uses the address acme-sg. Change the name." });
    expect(audits()).toHaveLength(0);
  });

  it("refuses malformed fields before reading anything", async () => {
    const res = await createLegalEntity({ ...NEW, country: "SGP", baseCurrency: "S$" });
    expect(res).toEqual({
      ok: false,
      error: "Country: Use the two-letter country code, e.g. VN or US. Currency: Use the three-letter currency code, e.g. VND or USD.",
    });
    expect(calls).toHaveLength(0);
  });
});
