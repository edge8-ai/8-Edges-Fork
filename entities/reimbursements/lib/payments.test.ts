import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script, scriptStorage, storageCalls } from "@/kernel/data/testing/fake-company-os";

// Recording payments (design §2.4, decisions 4, 5 and 7). What these assert is
// what the run page, the claims' history and the people told would observe:
// a payment recorded only with its receipt, its claims paid, the run paid
// once its last payment is, and a failed transfer returned with its reason.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const audited: Record<string, unknown>[] = [];
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async (i: Record<string, unknown>) => void audited.push(i) }));
const told: { fact: string; input: Record<string, unknown> }[] = [];
vi.mock("./notices", () => {
  const tell = (fact: string) => async (input: Record<string, unknown>) => void told.push({ fact, input });
  return {
    tellOwnerOfPayment: tell("paid"),
    tellOwnerOfReturn: tell("returned"),
    tellAccountingOfRunPaid: tell("run_paid"),
    tellOfSubmission: tell("submitted"),
    tellOwnerOfDecision: tell("decision"),
    tellApproversOfCheck: tell("checked"),
  };
});

import { confirmBankReceiptUpload, recordPayment, returnPayment } from "./payments";
import type { ClaimActor } from "./claim-lifecycle";

const payer: ClaimActor = { kind: "payer", personId: "person-finance", mayDecideOwn: false, label: "finance@example.test" };
// A made-up account number in a constant, so no fixture writes one beside its column name.
const ACCOUNT = "19034567";
const payment = (status = "to_pay") => ({ id: "pay-1", run_id: "run-1", person_id: "person-a", status, amount_vnd: 1_500_000 });
const claim = (id: string) => ({ id, status: "in_run", person_id: "person-a", title: `Claim ${id}`, submitted_at: "2026-10-05T02:00:00Z" });
const writes = (table: string, op = "update") => calls.filter((c) => c.table === table && c.ops[0] === op);

beforeEach(() => {
  resetFake();
  audited.length = 0;
  told.length = 0;
});

describe("recordPayment", () => {
  it("refuses a payment without its confirmed bank receipt, and writes nothing", async () => {
    script("reimbursement_payments", { data: payment() });
    script("reimbursement_claims", { data: [claim("c1")] });
    script("reimbursement_files", { data: null });
    expect(await recordPayment({ paymentId: "pay-1", paidVnd: 1_500_000, receiptFileId: "file-1", actor: payer })).toEqual({
      ok: false,
      error: "Upload this person's bank receipt first: a payment is recorded with its receipt.",
    });
    expect(writes("reimbursement_payments")).toHaveLength(0);
    expect(writes("reimbursement_claims")).toHaveLength(0);
  });

  it("records the payment with its receipt, the VND sent and a masked account, pays each claim, and pays the run when it was the last", async () => {
    script("reimbursement_payments", { data: payment() });
    script("reimbursement_claims", { data: [claim("c1"), claim("c3")] });
    script("reimbursement_files", { data: { id: "file-1" } });
    script("people_sensitive", { data: [{ person_id: "person-a", bank_name: "Techcombank", bank_account_number: ACCOUNT, bank_branch: null }] });
    script("reimbursement_payments", { data: [{ id: "pay-1" }] });
    for (const id of ["c1", "c3"]) {
      script("reimbursement_claims", { data: [{ id }] });
      script("reimbursement_claim_events", { data: { id: `event-${id}` } });
    }
    // Nothing left waiting in the run, one payment paid: the run is paid.
    script("reimbursement_claims", { data: [] });
    script("reimbursement_payments", { data: [{ id: "pay-1", amount_vnd: 1_500_000, paid_vnd: 1_490_000 }] });
    script("reimbursement_payment_runs", { data: [{ id: "run-1", run_date: "2026-10-15" }] });

    expect(await recordPayment({ paymentId: "pay-1", paidVnd: 1_490_000, receiptFileId: "file-1", actor: payer })).toEqual({ ok: true });

    const recorded = writes("reimbursement_payments")[0];
    expect(recorded.payloads[0]).toMatchObject({
      status: "paid",
      paid_vnd: 1_490_000,
      paid_by: "person-finance",
      bank_receipt_file_id: "file-1",
      bank_name_snapshot: "Techcombank",
      bank_account_last4: "4567",
    });
    expect(recorded.filters).toEqual([
      ["eq", "id", "pay-1"],
      ["eq", "status", "to_pay"],
    ]);
    const paid = writes("reimbursement_claims").map((c) => c.payloads[0] as Record<string, unknown>);
    expect(paid.map((p) => [p.status, p.payment_id])).toEqual([
      ["paid", "pay-1"],
      ["paid", "pay-1"],
    ]);
    expect(writes("reimbursement_payment_runs")[0].payloads[0]).toMatchObject({ status: "paid" });
    expect(writes("reimbursement_payment_runs")[0].filters).toContainEqual(["eq", "status", "open"]);
    expect(told.map((t) => t.fact)).toEqual(["paid", "run_paid"]);
    expect(told[0].input).toEqual({ paymentId: "pay-1", personId: "person-a", paidVnd: 1_490_000, claims: [{ id: "c1", title: "Claim c1" }, { id: "c3", title: "Claim c3" }] });
    expect(told[1].input).toEqual({ runId: "run-1", runDate: "2026-10-15", people: 1, totalVnd: 1_490_000 });
    // The read of the account for the masked record is audited, and so is the payment.
    expect(audited.map((a) => a.table)).toEqual(expect.arrayContaining(["people_sensitive", "reimbursement_payments"]));
  });

  it("leaves the run open while another payment still waits", async () => {
    script("reimbursement_payments", { data: payment() });
    script("reimbursement_claims", { data: [claim("c1")] });
    script("reimbursement_files", { data: { id: "file-1" } });
    script("people_sensitive", { data: [{ person_id: "person-a", bank_name: "Techcombank", bank_account_number: ACCOUNT, bank_branch: null }] });
    script("reimbursement_payments", { data: [{ id: "pay-1" }] });
    script("reimbursement_claims", { data: [{ id: "c1" }] });
    script("reimbursement_claim_events", { data: { id: "event-c1" } });
    script("reimbursement_claims", { data: [{ id: "c9" }] });
    script("reimbursement_payments", { data: [{ id: "pay-1", amount_vnd: 1_500_000, paid_vnd: 1_500_000 }] });
    expect(await recordPayment({ paymentId: "pay-1", paidVnd: 1_500_000, receiptFileId: "file-1", actor: payer })).toEqual({ ok: true });
    expect(writes("reimbursement_payment_runs")).toHaveLength(0);
    expect(told.map((t) => t.fact)).toEqual(["paid"]);
  });

  it("answers a failure, never a silent ok, when it cannot tell whether the run is now paid", async () => {
    script("reimbursement_payments", { data: payment() });
    script("reimbursement_claims", { data: [claim("c1")] });
    script("reimbursement_files", { data: { id: "file-1" } });
    script("people_sensitive", { data: [{ person_id: "person-a", bank_name: "Techcombank", bank_account_number: ACCOUNT, bank_branch: null }] });
    script("reimbursement_payments", { data: [{ id: "pay-1" }] });
    script("reimbursement_claims", { data: [{ id: "c1" }] });
    script("reimbursement_claim_events", { data: { id: "event-c1" } });
    // The read of what still waits in the run fails.
    script("reimbursement_claims", { data: null, error: { message: "connection reset" } });
    script("reimbursement_payments", { data: [{ id: "pay-1", amount_vnd: 1_500_000, paid_vnd: 1_500_000 }] });
    const answer = await recordPayment({ paymentId: "pay-1", paidVnd: 1_500_000, receiptFileId: "file-1", actor: payer });
    expect(answer.ok).toBe(false);
    expect(!answer.ok && answer.error).toMatch(/^The payment is recorded, but the run could not be brought up to date: .*connection reset/);
    expect(writes("reimbursement_payment_runs")).toHaveLength(0);
  });

  it("refuses a payment already recorded as paid: a decision repeated is refused", async () => {
    script("reimbursement_payments", { data: payment("paid") });
    expect(await recordPayment({ paymentId: "pay-1", paidVnd: 1_500_000, receiptFileId: "file-1", actor: payer })).toEqual({ ok: false, error: "This payment is already recorded as paid." });
  });

  it("refuses anyone but the payer, and an amount that is not whole dong", async () => {
    const checker: ClaimActor = { ...payer, kind: "checker" };
    expect((await recordPayment({ paymentId: "pay-1", paidVnd: 1, receiptFileId: "file-1", actor: checker })).ok).toBe(false);
    expect(await recordPayment({ paymentId: "pay-1", paidVnd: 12.5, receiptFileId: "file-1", actor: payer })).toEqual({ ok: false, error: "Enter the VND actually sent, in whole dong." });
    expect(calls).toHaveLength(0);
  });
});

describe("returnPayment", () => {
  it("returns each claim to approved with the reason, empties the payment, recounts the run and tells the person", async () => {
    script("reimbursement_payments", { data: payment() });
    script("reimbursement_claims", { data: [claim("c1")] });
    script("reimbursement_claims", { data: [{ id: "c1" }] });
    script("reimbursement_claim_events", { data: { id: "event-r1" } });
    script("reimbursement_payments", { data: null });
    script("reimbursement_claims", { data: [{ person_id: "person-c", approved_total_vnd: 250_000 }] });
    script("reimbursement_payment_runs", { data: null });
    // The run still has a claim waiting, so it is not paid.
    script("reimbursement_claims", { data: [{ id: "c2" }] });
    script("reimbursement_payments", { data: [] });

    expect(await returnPayment({ paymentId: "pay-1", reason: "Account number rejected by the bank", actor: payer })).toEqual({ ok: true });
    const moved = writes("reimbursement_claims")[0];
    expect(moved.payloads[0]).toEqual({ status: "approved", payment_run_id: null, payment_id: null });
    const history = writes("reimbursement_claim_events", "insert")[0].payloads[0];
    expect(history).toMatchObject({ from_status: "in_run", to_status: "approved", reason: "Account number rejected by the bank", metadata: { paymentId: "pay-1", runId: "run-1" } });
    expect(writes("reimbursement_payments")[0].payloads[0]).toEqual({ amount_vnd: 0 });
    expect(writes("reimbursement_payment_runs")[0].payloads[0]).toEqual({ claims_count: 1, people_count: 1, total_vnd: 250_000 });
    expect(told).toEqual([{ fact: "returned", input: { paymentId: "pay-1", personId: "person-a", reason: "Account number rejected by the bank", claims: [{ id: "c1", title: "Claim c1" }] } }]);
  });

  it("answers a failure, never a silent ok, when the run cannot be recounted", async () => {
    script("reimbursement_payments", { data: payment() });
    script("reimbursement_claims", { data: [claim("c1")] });
    script("reimbursement_claims", { data: [{ id: "c1" }] });
    script("reimbursement_claim_events", { data: { id: "event-r1" } });
    script("reimbursement_payments", { data: null });
    script("reimbursement_claims", { data: null, error: { message: "connection reset" } });
    const answer = await returnPayment({ paymentId: "pay-1", reason: "Account number rejected by the bank", actor: payer });
    expect(answer.ok).toBe(false);
    expect(!answer.ok && answer.error).toMatch(/^The payment is returned, but the run could not be brought up to date: .*connection reset/);
    expect(writes("reimbursement_payment_runs")).toHaveLength(0);
  });

  it("needs a reason, because it is what the person is told", async () => {
    expect(await returnPayment({ paymentId: "pay-1", reason: "  ", actor: payer })).toEqual({ ok: false, error: "Give a reason: it is what the person is told." });
    expect(calls).toHaveLength(0);
  });
});

describe("confirmBankReceiptUpload", () => {
  it("refuses a file whose bytes are not what it says, removing the object and keeping the row (a bank receipt is never deleted)", async () => {
    script("reimbursement_files", { data: { id: "file-1", storage_path: "payment/run-1/pay-1/file-1-r.pdf", filename: "r.pdf", confirmed_at: null } });
    scriptStorage("info", { data: { size: 100, contentType: "application/pdf" } });
    scriptStorage("download", { data: new Blob([new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c])]) });
    scriptStorage("remove", { data: [] });
    expect(await confirmBankReceiptUpload({ paymentId: "pay-1", fileId: "file-1" })).toEqual({ ok: false, error: "r.pdf can't be attached: it is not the PDF or image it says it is." });
    expect(storageCalls.map((c) => c.op)).toEqual(["info", "download", "remove"]);
    expect(writes("reimbursement_files", "delete")).toHaveLength(0);
    expect(writes("reimbursement_files")).toHaveLength(0);
  });
});
