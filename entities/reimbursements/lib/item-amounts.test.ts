import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// RB.26: once a receipt's files are read, its owner edits the amounts only.
// A receipt carrying its bank deduction is paid what the bank took, always.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async () => {} }));
vi.mock("./vnd-rates", () => ({ fxRateTable: {}, rateFor: async () => ({ rate: 25805, source: "techcombank", asOf: "2026-11-05" }) }));

const { updateItemAmounts } = await import("./item-amounts");

const CLAIM = "11111111-1111-4111-8111-111111111111";
const ITEM = "22222222-2222-4222-8222-222222222222";
const OWNER = "person-a";
const own = (currency: string) => ({ id: ITEM, removed_at: null, currency, reimbursement_claims: { id: CLAIM, status: "draft", person_id: OWNER, title: "Claude", submitted_at: null } });
const receipt = { kind: "receipt", replaced_at: null };
const deduction = { kind: "bank_deduction", replaced_at: null };
const saved = () => calls.find((c) => c.table === "reimbursement_claim_items" && c.ops[0] === "update")?.payloads[0];

function scriptItem(currency: string, docs: Record<string, unknown>[], boughtOn = "2026-11-05") {
  script("reimbursement_claim_items", { data: own(currency) }, { data: { currency, bought_on: boughtOn } }, { data: [{ id: ITEM }] });
  script("reimbursement_files", { data: docs });
}

beforeEach(() => resetFake());

describe("a receipt carrying its bank deduction", () => {
  it("is paid the dong the owner corrects it to", async () => {
    scriptItem("usd", [receipt, deduction]);
    expect(await updateItemAmounts({ itemId: ITEM, personId: OWNER, amounts: { amount: 11111, currency: "usd", paidVnd: 2940000 } })).toEqual({ ok: true });
    expect(saved()).toMatchObject({ amount_cents: 11111, currency: "usd", charged_vnd: 2940000, amount_vnd: 2940000, fx_source: "card" });
  });

  it("refuses an empty paid amount: the bank deduction is what is paid", async () => {
    script("reimbursement_claim_items", { data: own("usd") }, { data: { currency: "usd", bought_on: "2026-11-05" } });
    script("reimbursement_files", { data: [receipt, deduction] });
    expect(await updateItemAmounts({ itemId: ITEM, personId: OWNER, amounts: { amount: 11111, currency: "usd", paidVnd: null } })).toEqual({
      ok: false,
      error: "Your bank deduction is what you are paid: enter the dong it shows.",
    });
    expect(saved()).toBeUndefined();
  });
});

describe("a receipt abroad with no bank deduction", () => {
  it("is paid at the bank's selling rate on its date when nothing is typed", async () => {
    scriptItem("usd", [receipt]);
    expect(await updateItemAmounts({ itemId: ITEM, personId: OWNER, amounts: { amount: 11111, currency: "usd" } })).toEqual({ ok: true });
    expect(saved()).toMatchObject({ charged_vnd: null, fx_rate: 25805, fx_source: "techcombank", amount_vnd: 2867194 });
  });

  it("is paid what the owner says the bank took", async () => {
    scriptItem("usd", [receipt]);
    expect(await updateItemAmounts({ itemId: ITEM, personId: OWNER, amounts: { amount: 11111, currency: "usd", paidVnd: 2937648 } })).toEqual({ ok: true });
    expect(saved()).toMatchObject({ charged_vnd: 2937648, amount_vnd: 2937648 });
  });
});

describe("a lone bank deduction", () => {
  it("is a dong amount", async () => {
    scriptItem("vnd", [deduction]);
    expect(await updateItemAmounts({ itemId: ITEM, personId: OWNER, amounts: { amount: 2937648, currency: "vnd" } })).toEqual({ ok: true });
    expect(saved()).toMatchObject({ amount_cents: 2937648, currency: "vnd", amount_vnd: 2937648 });
  });

  it("refuses another currency", async () => {
    script("reimbursement_claim_items", { data: own("vnd") }, { data: { currency: "vnd", bought_on: "2026-11-06" } });
    script("reimbursement_files", { data: [deduction] });
    expect((await updateItemAmounts({ itemId: ITEM, personId: OWNER, amounts: { amount: 11111, currency: "usd" } })).ok).toBe(false);
    expect(saved()).toBeUndefined();
  });
});

it("moves a receipt abroad when its currency changes from dong", async () => {
  scriptItem("vnd", [receipt]);
  script("reimbursement_files", { data: [] }); // no red invoice to refile
  expect(await updateItemAmounts({ itemId: ITEM, personId: OWNER, amounts: { amount: 6280, currency: "aud" } })).toEqual({ ok: true });
  expect(saved()).toMatchObject({ currency: "aud", bought_in_vietnam: false });
});

it("refuses an amount that is not a positive whole number of minor units", async () => {
  expect((await updateItemAmounts({ itemId: ITEM, personId: OWNER, amounts: { amount: 0, currency: "usd" } })).ok).toBe(false);
  expect(calls).toHaveLength(0);
});
