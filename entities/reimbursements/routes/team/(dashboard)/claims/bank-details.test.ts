import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// RB.5 (design §1.1, §1.11): the claim page pre-fills the owner's bank details
// from people_sensitive, and "confirm or change" writes them back through
// crm's upsertPeopleSensitive, which audits by field name. The alert to the
// person and HR is the caller's job (as on /team/profile), so the action sends
// it, and only when a bank field actually changed. The action takes no person
// id: it writes the signed-in person's own row and nobody else's.
const asked: string[] = [];
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async (p: string) => void asked.push(p) }));
vi.mock("@/kernel/identity/team-auth", () => ({
  requireTeamMember: vi.fn(async () => ({ personId: "person-a", displayName: "Avery", email: "a@example.test" })),
}));
const upsert = vi.fn();
vi.mock("@/entities/crm", () => ({ upsertPeopleSensitive: (...a: unknown[]) => upsert(...a) }));
const alert = vi.fn(async () => {});
vi.mock("@/kernel/messaging/email", () => ({ sendBankChangeAlert: (...a: unknown[]) => alert(...(a as [])) }));
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const audited: Record<string, unknown>[] = [];
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async (i: Record<string, unknown>) => void audited.push(i) }));

import { confirmOwnBankDetails, saveOwnBankDetails } from "./actions";
import { readOwnBankDetails } from "@/entities/reimbursements/lib/own-bank-details";

// Made-up account numbers, held in constants so no fixture writes an account
// number as a quoted literal beside its column name, which the public fork's
// content scanner refuses as a bank value.
const GROUPED = "1903 4567 8910";
const PLAIN = "19034567";
const details = { bankName: " Techcombank ", accountNumber: GROUPED, branch: "" };

beforeEach(() => {
  asked.length = 0;
  audited.length = 0;
  upsert.mockReset();
  alert.mockClear();
  resetFake();
});

describe("saveOwnBankDetails", () => {
  it("writes the three bank fields to the actor's own row and alerts when one changed", async () => {
    upsert.mockResolvedValue({ ok: true, changed: ["bank_name", "bank_account_number"] });
    expect(await saveOwnBankDetails(details)).toEqual({ ok: true });
    expect(asked).toEqual(["reimbursements.mine"]);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      "person-a",
      { bank_name: "Techcombank", bank_account_number: GROUPED, bank_branch: null },
      "a@example.test",
    );
    expect(alert).toHaveBeenCalledWith({ employeeName: "Avery", employeeEmail: "a@example.test" });
  });

  it("confirms unchanged details without an alert", async () => {
    upsert.mockResolvedValue({ ok: true, changed: [] });
    expect(await saveOwnBankDetails(details)).toEqual({ ok: true });
    expect(alert).not.toHaveBeenCalled();
  });

  it("sends no alert when the write fails, and says so", async () => {
    upsert.mockResolvedValue({ ok: false, error: "Could not save the record." });
    expect(await saveOwnBankDetails(details)).toEqual({ ok: false, error: "Could not save the record." });
    expect(alert).not.toHaveBeenCalled();
  });

  it("refuses details Finance could not pay to, before writing anything", async () => {
    expect(await saveOwnBankDetails({ bankName: "", accountNumber: "1903", branch: "" })).toMatchObject({ ok: false });
    expect(await saveOwnBankDetails({ bankName: "Techcombank", accountNumber: "", branch: "" })).toMatchObject({ ok: false });
    expect(await saveOwnBankDetails({ bankName: "Techcombank", accountNumber: "call me", branch: "" })).toMatchObject({ ok: false });
    expect(upsert).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });
});

// "These are right" is recorded on the claim (metadata.bankConfirmedAt), so it
// survives a reload and the payer can later see the claimant confirmed where
// to be paid. Only the owner, only while the claim is theirs to change, and
// only with details on file: confirming nothing is not a confirmation.
describe("confirmOwnBankDetails", () => {
  const CLAIM = "22222222-2222-4222-8222-222222222222";
  const claimUpdates = () => calls.filter((c) => c.table === "reimbursement_claims" && c.ops[0] === "update");

  it("stamps the owner's open claim, keeping what its metadata already held, guarded on owner and status", async () => {
    script("reimbursement_claims", { data: { id: CLAIM, status: "draft", metadata: { note: "kept" } } }, { data: [{ id: CLAIM }] });
    script("people_sensitive", { data: { bank_name: "Techcombank", bank_account_number: PLAIN } });
    expect(await confirmOwnBankDetails(CLAIM)).toEqual({ ok: true });
    expect(asked).toEqual(["reimbursements.mine"]);
    const [read] = calls.filter((c) => c.table === "reimbursement_claims" && c.ops[0] === "select");
    expect(read.filters).toEqual([["eq", "id", CLAIM], ["eq", "person_id", "person-a"]]);
    const [update] = claimUpdates();
    expect(update.payloads[0]).toEqual({ metadata: { note: "kept", bankConfirmedAt: expect.any(String) } });
    expect(update.filters).toEqual([
      ["eq", "id", CLAIM],
      ["eq", "person_id", "person-a"],
      ["in", "status", ["draft", "sent_back"]],
    ]);
    expect(audited).toEqual([expect.objectContaining({ table: "reimbursement_claims", recordId: CLAIM, context: { move: "confirm_bank_details" } })]);
  });

  it("refuses without writing: no details on file, a claim no longer the owner's to change, someone else's claim", async () => {
    script("reimbursement_claims", { data: { id: CLAIM, status: "draft", metadata: {} } });
    script("people_sensitive", { data: { bank_name: "", bank_account_number: null } });
    expect(await confirmOwnBankDetails(CLAIM)).toEqual({ ok: false, error: "Add your bank details before confirming them." });

    script("reimbursement_claims", { data: { id: CLAIM, status: "checked", metadata: {} } });
    expect(await confirmOwnBankDetails(CLAIM)).toEqual({ ok: false, error: "Bank details are confirmed while the claim is yours to change." });

    script("reimbursement_claims", { data: null });
    expect(await confirmOwnBankDetails(CLAIM)).toEqual({ ok: false, error: "Claim not found." });
    expect(await confirmOwnBankDetails("not-a-claim")).toEqual({ ok: false, error: "Claim not found." });
    expect(claimUpdates()).toHaveLength(0);
  });

  it("answers that the claim changed when the guarded write matched nothing", async () => {
    script("reimbursement_claims", { data: { id: CLAIM, status: "draft", metadata: {} } }, { data: [] });
    script("people_sensitive", { data: { bank_name: "Techcombank", bank_account_number: PLAIN } });
    expect(await confirmOwnBankDetails(CLAIM)).toEqual({ ok: false, error: "This claim changed while you were working on it. Reload and try again." });
    expect(audited).toHaveLength(0);
  });
});

describe("readOwnBankDetails", () => {
  it("pre-fills from the person's people_sensitive row, and reads that one row only", async () => {
    script("people_sensitive", { data: { bank_name: "Techcombank", bank_account_number: PLAIN, bank_branch: "Hà Nội" } });
    expect(await readOwnBankDetails("person-a")).toEqual({ bankName: "Techcombank", accountNumber: PLAIN, branch: "Hà Nội" });
    // RB.5.3: the person's own row, by the id the caller passed, and nobody
    // else's. Without the filter maybeSingle runs over the whole table: the
    // database refuses more than one row, and every claim page fails.
    expect(calls.filter((c) => c.table === "people_sensitive").map((c) => c.filters)).toEqual([[["eq", "person_id", "person-a"]]]);
  });

  it("answers null when nothing is on file", async () => {
    script("people_sensitive", { data: null });
    expect(await readOwnBankDetails("person-a")).toBeNull();
    script("people_sensitive", { data: { bank_name: null, bank_account_number: null, bank_branch: null } });
    expect(await readOwnBankDetails("person-a")).toBeNull();
  });

  it("raises a failed read rather than showing an empty form someone would fill over real details", async () => {
    script("people_sensitive", { error: { message: "timeout" } });
    await expect(readOwnBankDetails("person-a")).rejects.toThrow(/people_sensitive/);
  });
});
