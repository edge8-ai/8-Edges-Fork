import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Who may enter the company's account, and for which companies. The guard is the
// same atom as the registration details beside it.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const requirePermission = vi.fn(async (_p: string) => ({ user: { email: "owner@example.test" } }));
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: (p: string) => requirePermission(p) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { updateLegalEntityBank } = await import("./bank-actions");

const ID = "7d1f0c3e-2b4a-4c5d-8e9f-0a1b2c3d4e5f";
const ACCOUNT = "12345678";
const input = { id: ID, bankName: "Vietcombank", accountNumber: ACCOUNT, holder: "Acme Co., Ltd", reason: "From the bank's letter" };
const company = (country: string) => ({ id: ID, slug: "acme", name: "Acme", legal_name: "Acme Co., Ltd", country, entity_type: "llc", base_currency: "vnd", active: true });
const accountWrites = () => calls.filter((c) => c.table === "legal_entities_sensitive" && (c.ops.includes("insert") || c.ops.includes("update")));

beforeEach(() => {
  resetFake();
  requirePermission.mockClear();
});

describe("updateLegalEntityBank", () => {
  it("asks for org.legal-registration before reading anything", async () => {
    requirePermission.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(updateLegalEntityBank(input)).rejects.toThrow("NEXT_REDIRECT");
    expect(requirePermission).toHaveBeenCalledWith("org.legal-registration");
    expect(calls).toHaveLength(0);
  });

  it("saves a Vietnamese company's account", async () => {
    script("legal_entities", { data: [company("VN")] });
    script("legal_entities_sensitive", { data: [] }, { data: null });
    script("audit_log", { data: null });
    expect(await updateLegalEntityBank(input)).toEqual({ ok: true });
    expect(accountWrites()).toHaveLength(1);
  });

  it("refuses a company elsewhere, whose bank the list could not name", async () => {
    script("legal_entities", { data: [company("US")] });
    expect(await updateLegalEntityBank(input)).toEqual({ ok: false, error: expect.stringContaining("Vietnamese") });
    expect(accountWrites()).toEqual([]);
  });

  it("refuses without a reason", async () => {
    expect((await updateLegalEntityBank({ ...input, reason: "" })).ok).toBe(false);
    expect(accountWrites()).toEqual([]);
  });

  it("refuses an account the rules refuse, on the server too", async () => {
    script("legal_entities", { data: [company("VN")] });
    script("legal_entities_sensitive", { data: [] });
    expect((await updateLegalEntityBank({ ...input, bankName: "Not a bank" })).ok).toBe(false);
    expect(accountWrites()).toEqual([]);
  });
});
