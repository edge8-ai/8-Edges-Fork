import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script, timeline } from "@/kernel/data/testing/fake-company-os";

// updateLegalEntityRegistration: Finance's and a Super Admin's action for the
// registration details. It asks for org.legal-registration before anything
// else, checks the change against the stored row with the same functions the
// drawer runs, writes compare-and-set, and records the values before and after
// with the reason.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const requirePermission = vi.fn(async (_p: string) => ({ user: { email: "finance@example.test" } }));
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: (p: string) => requirePermission(p) }));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }));

const { updateLegalEntityRegistration } = await import("./registration-actions");

const ID = "7d1f0c3e-2b4a-4c5d-8e9f-0a1b2c3d4e5f";
const PERSON = "0b8c7d6e-5f4a-4b3c-9d2e-1f0a9b8c7d6e";
// Made-up company and numbers.
const ROW = {
  id: ID,
  slug: "acme-vn",
  name: "Acme Vietnam",
  legal_name: "Acme Vietnam Co., Ltd",
  country: "VN",
  entity_type: "corporation",
  base_currency: "vnd",
  active: true,
  tax_id: null,
  registration_number: null,
  registered_address: null,
  legal_representative_person_id: null,
  jurisdiction: null,
  incorporated_on: null,
};
const BLANK = { taxId: "", registrationNumber: "", registeredAddress: "", legalRepresentativePersonId: "", jurisdiction: "", incorporatedOn: "" };
const REASON = "From the business registration certificate";

const save = (over: Partial<typeof BLANK> & { reason?: string; id?: string }) => updateLegalEntityRegistration({ id: ID, ...BLANK, reason: REASON, ...over });
const writes = () => calls.filter((c) => c.ops.includes("update") || c.ops.includes("insert"));
const audits = () => calls.filter((c) => c.table === "audit_log" && c.ops.includes("insert")).map((c) => c.payloads[0] as Record<string, unknown>);

beforeEach(() => {
  resetFake();
  requirePermission.mockClear();
  revalidatePath.mockClear();
});

describe("updateLegalEntityRegistration", () => {
  it("asks for org.legal-registration before it reads or writes anything", async () => {
    requirePermission.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(save({ taxId: "0101234567" })).rejects.toThrow("NEXT_REDIRECT");
    expect(requirePermission).toHaveBeenCalledWith("org.legal-registration");
    expect(calls).toHaveLength(0);
  });

  it("writes the changed fields compare-and-set, then audits them with the reason", async () => {
    script("legal_entities", { data: [ROW] }, { data: [{ id: ID }] });
    script("audit_log", {});

    expect(await save({ taxId: " 0101234567 ", jurisdiction: "Hanoi" })).toEqual({ ok: true });

    const update = calls.find((c) => c.table === "legal_entities" && c.ops.includes("update"));
    expect(update?.payloads[0]).toEqual({ tax_id: "0101234567", jurisdiction: "Hanoi" });
    // Matched only while the changed columns still hold what was read.
    expect(update?.filters).toEqual([
      ["eq", "id", ID],
      ["is", "tax_id", null],
      ["is", "jurisdiction", null],
    ]);
    expect(audits()).toEqual([
      expect.objectContaining({
        table_name: "legal_entities",
        record_id: ID,
        operation: "update",
        actor_label: "finance@example.test",
        old_data: { tax_id: null, jurisdiction: null },
        new_data: { tax_id: "0101234567", jurisdiction: "Hanoi" },
        context: { reason: REASON },
      }),
    ]);
    expect(timeline()).toEqual(["legal_entities:select", "legal_entities:update", "audit_log:insert"]);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings/legal-entities");
  });

  it("names a legal representative only from the current team", async () => {
    script("legal_entities", { data: [ROW] }, { data: [{ id: ID }] });
    script("team_members", { data: [{ person: { id: PERSON, full_name: "Dana Example", display_name: null, preferred_name: null, email: null, archived_at: null } }] });
    script("audit_log", {});
    expect(await save({ legalRepresentativePersonId: PERSON })).toEqual({ ok: true });

    resetFake();
    script("legal_entities", { data: [ROW] });
    script("team_members", { data: [] });
    expect(await save({ legalRepresentativePersonId: PERSON })).toEqual({ ok: false, error: "Legal representative: Choose someone on the team." });
    expect(writes()).toHaveLength(0);
  });

  it.each([
    ["a tax code in the wrong format", { taxId: "12-3456789" }, "Tax code (mã số thuế): 10 digits, or 10 digits, a dash and 3 for a branch."],
    ["a registration number in the wrong format", { registrationNumber: "BRC-1" }, "Business registration number (mã số doanh nghiệp): 10 digits, or 10 digits, a dash and 3 for a branch."],
    ["a date of incorporation in the future", { incorporatedOn: "2999-01-01" }, "Incorporated on: A company cannot be incorporated in the future."],
    ["a change that moves nothing", {}, "Nothing changed."],
  ])("refuses %s and writes nothing", async (_case, over, error) => {
    script("legal_entities", { data: [ROW] });
    expect(await save(over)).toEqual({ ok: false, error });
    expect(writes()).toHaveLength(0);
  });

  it("refuses to blank a field once recorded, and says why", async () => {
    script("legal_entities", { data: [{ ...ROW, tax_id: "0101234567" }] });
    const res = await save({});
    expect(res).toEqual({ ok: false, error: "Tax code (mã số thuế): Once recorded it cannot be removed, because the law requires it on record. Correct it instead." });
    expect(writes()).toHaveLength(0);
  });

  it("refuses a missing or too-short reason before reading the row", async () => {
    expect(await save({ taxId: "0101234567", reason: "ok" })).toEqual({ ok: false, error: "Say why, in at least 5 characters." });
    expect(calls).toHaveLength(0);
  });

  it("refuses an id that is not one and an unknown entity", async () => {
    expect((await save({ id: "nope", taxId: "0101234567" })).ok).toBe(false);
    expect(calls).toHaveLength(0);
    script("legal_entities", { data: [] });
    expect(await save({ taxId: "0101234567" })).toEqual({ ok: false, error: "That legal entity does not exist." });
  });

  it("tells the person to reload when someone else changed the row first", async () => {
    script("legal_entities", { data: [ROW] }, { data: [] });
    const res = await save({ taxId: "0101234567" });
    expect(res).toEqual({ ok: false, error: "Someone changed this legal entity after you opened it. Reload the page and make your change again." });
    expect(audits()).toHaveLength(0);
  });

  it("surfaces a failed read and a failed write", async () => {
    script("legal_entities", { error: { message: "db down" } });
    await expect(save({ taxId: "0101234567" })).rejects.toThrow("read failed: [org/legal-entities] legal_entities: db down");

    resetFake();
    script("legal_entities", { data: [ROW] }, { error: { message: "permission denied" } });
    expect(await save({ taxId: "0101234567" })).toEqual({ ok: false, error: "Could not save the change: permission denied" });
    expect(audits()).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
