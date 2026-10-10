import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The payer's read of a run's bank details (design §1.11): only the run's
// people, and every read audited.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const audited: Record<string, unknown>[] = [];
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async (i: Record<string, unknown>) => void audited.push(i) }));

import { maskedSnapshot, readRunBankDetails } from "./bank-details";

// Made-up account numbers held in constants, so no fixture writes one beside its column name.
const ACCOUNT_A = "19034567";
const ACCOUNT_B = "0071000123";

beforeEach(() => {
  resetFake();
  audited.length = 0;
});

describe("readRunBankDetails", () => {
  it("reads the run's people only, and audits the read with the run", async () => {
    script("people_sensitive", {
      data: [
        { person_id: "p1", bank_name: "Techcombank", bank_account_number: ACCOUNT_A, bank_branch: "Hanoi" },
        { person_id: "p2", bank_name: null, bank_account_number: null, bank_branch: null },
      ],
    });
    const banks = await readRunBankDetails({ runId: "run-1", personIds: ["p1", "p2", "p1"], actor: "payer@example.test", purpose: "run_page" });
    expect(calls[0].filters).toEqual([["in", "person_id", ["p1", "p2"]]]);
    expect([...banks.entries()]).toEqual([["p1", { bankName: "Techcombank", accountNumber: ACCOUNT_A, branch: "Hanoi" }]]);
    expect(audited).toEqual([
      expect.objectContaining({
        table: "people_sensitive",
        // A read is recorded as a read (audit_log.operation accepts 'read' since 20261008090000), never as an update.
        operation: "read",
        actor: "payer@example.test",
        context: { access: "read", bankDetailsViewed: true, runId: "run-1", purpose: "run_page", personIds: ["p1", "p2"] },
      }),
    ]);
  });

  it("reads and audits nothing for a run with nobody in it", async () => {
    expect((await readRunBankDetails({ runId: "run-1", personIds: [], actor: null, purpose: "run_page" })).size).toBe(0);
    expect(calls).toHaveLength(0);
    expect(audited).toHaveLength(0);
  });

  it("raises on a failed read rather than showing nobody's details", async () => {
    script("people_sensitive", { error: { message: "db down" } });
    await expect(readRunBankDetails({ runId: "run-1", personIds: ["p1"], actor: null, purpose: "run_page" })).rejects.toThrow("db down");
  });
});

describe("maskedSnapshot", () => {
  it("keeps the bank's name and the last four digits only", () => {
    expect(maskedSnapshot({ bankName: "Vietcombank", accountNumber: ACCOUNT_B, branch: "HCMC" })).toEqual({ bank_name_snapshot: "Vietcombank", bank_account_last4: "0123" });
    expect(maskedSnapshot(null)).toEqual({ bank_name_snapshot: null, bank_account_last4: null });
  });
});
