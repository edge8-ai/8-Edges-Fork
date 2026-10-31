import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

vi.mock("@/kernel/data/supabase", async () => (await import("@/kernel/data/testing/fake-company-os")).fakeSupabase());
const requirePermission = vi.fn();
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: (p: string) => requirePermission(p) }));
const recordAudit = vi.fn();
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: (input: unknown) => recordAudit(input) }));
vi.mock("@/kernel/shell/surface", () => ({ revalidateSurfaces: () => undefined }));

import { archiveRenewal, saveRenewal } from "./renewal-actions";

const COMPANY = "33333333-3333-4333-8333-333333333333";
const RENEWAL = "44444444-4444-4444-8444-444444444444";
const input = { companyId: COMPANY, renewsOn: "2027-01-31", termMonths: 12, status: "upcoming" as const, note: "Annual retainer" };

beforeEach(() => {
  resetFake();
  requirePermission.mockReset().mockResolvedValue({ user: { id: "auth-x", email: "reviewer@example.test" } });
  recordAudit.mockReset();
});

describe("saveRenewal", () => {
  it("checks revenue access before anything else", async () => {
    requirePermission.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(saveRenewal(input)).rejects.toThrow("NEXT_REDIRECT");
    expect(requirePermission).toHaveBeenCalledWith("crm.pipeline");
    expect(calls).toHaveLength(0);
  });

  it("refuses a malformed date without touching the table", async () => {
    const r = await saveRenewal({ ...input, renewsOn: "next spring" });
    expect(r).toEqual({ ok: false, error: "Pick a renewal date." });
    expect(calls).toHaveLength(0);
  });

  it("edits the live renewal when there is one, and audits it", async () => {
    script("renewals", { data: { id: RENEWAL } }, { data: null });
    expect(await saveRenewal(input)).toEqual({ ok: true });
    const write = calls[1];
    expect(write.ops[0]).toBe("update");
    expect(write.payloads[0]).toEqual({ renews_on: "2027-01-31", term_months: 12, status: "upcoming", note: "Annual retainer" });
    expect(write.filters).toContainEqual(["eq", "id", RENEWAL]);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ table: "renewals", recordId: RENEWAL, operation: "update", actor: "reviewer@example.test" }));
  });

  it("starts a renewal when the company has none", async () => {
    script("renewals", { data: null }, { data: { id: RENEWAL } });
    expect(await saveRenewal({ ...input, note: "" })).toEqual({ ok: true });
    expect(calls[1].ops[0]).toBe("insert");
    expect(calls[1].payloads[0]).toEqual({ company_id: COMPANY, renews_on: "2027-01-31", term_months: 12, status: "upcoming", note: null });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ recordId: RENEWAL, operation: "insert" }));
  });

  it("explains a concurrent first save instead of naming the constraint", async () => {
    script("renewals", { data: null }, { error: { message: 'duplicate key value violates unique constraint "renewals_live_company_key"' } });
    const r = await saveRenewal(input);
    expect(r).toEqual({ ok: false, error: "Someone else just set this renewal. Reload to see it." });
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("reports a failed read rather than inserting a second live row", async () => {
    script("renewals", { error: { message: "read failed" } });
    expect(await saveRenewal(input)).toEqual({ ok: false, error: "read failed" });
    expect(calls).toHaveLength(1);
  });
});

describe("archiveRenewal", () => {
  it("archives only the live row of that company, and audits it", async () => {
    script("renewals", { data: null });
    expect(await archiveRenewal(COMPANY, RENEWAL)).toEqual({ ok: true });
    expect(calls[0].ops[0]).toBe("update");
    expect(calls[0].filters).toEqual([
      ["eq", "id", RENEWAL],
      ["eq", "company_id", COMPANY],
      ["is", "archived_at", null],
    ]);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ table: "renewals", recordId: RENEWAL, operation: "archive" }));
  });
});
