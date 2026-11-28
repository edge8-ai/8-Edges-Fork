import { describe, expect, it } from "vitest";
import { hasJoined, hasJoinedDeduction, isLoneDeduction, joinRefusal, joinTargets, loneKind } from "./join-rules";

// RB.26: a bank deduction or a red invoice dropped as its own file lands as
// its own row, and the owner joins it to the receipt it belongs to. Nothing
// joins by itself (Khoa, 2026-11-06: "auto join is annoying").

const receipt = { kind: "receipt", replacedAt: null };
const deduction = { kind: "bank_deduction", replacedAt: null };
const redInvoice = { kind: "red_invoice", replacedAt: null };
const replaced = (d: { kind: string }) => ({ ...d, replacedAt: "2026-11-01T00:00:00Z" });

describe("a row on its own", () => {
  it("is a bank deduction or a red invoice when every current document is one", () => {
    expect(loneKind([deduction])).toBe("bank_deduction");
    expect(loneKind([redInvoice])).toBe("red_invoice");
    expect(isLoneDeduction([deduction])).toBe(true);
  });

  it("is not a receipt, a mix, or a row with no documents", () => {
    expect(loneKind([receipt])).toBeNull();
    expect(loneKind([receipt, deduction])).toBeNull();
    expect(loneKind([redInvoice, deduction])).toBeNull();
    expect(loneKind([])).toBeNull();
  });

  it("ignores a replaced document either way", () => {
    expect(loneKind([deduction, replaced(receipt)])).toBe("bank_deduction");
    expect(loneKind([replaced(deduction)])).toBeNull();
  });

  it("reads a replaced flag the same as a replaced stamp", () => {
    // The submit rule holds a document's replacement as a flag (claim-rules SubmitDocument), not a stamp.
    expect(loneKind([{ kind: "bank_deduction", replaced: false }, { kind: "receipt", replaced: true }])).toBe("bank_deduction");
    expect(isLoneDeduction([{ kind: "bank_deduction", replaced: true }])).toBe(false);
  });
});

describe("a joined document", () => {
  it("is a bank deduction beside another current document", () => {
    expect(hasJoinedDeduction([receipt, deduction])).toBe(true);
    expect(hasJoinedDeduction([redInvoice, deduction])).toBe(true);
    expect(hasJoinedDeduction([deduction])).toBe(false);
    expect(hasJoinedDeduction([receipt, replaced(deduction)])).toBe(false);
  });

  it("is a red invoice beside a current receipt", () => {
    expect(hasJoined([receipt, redInvoice], "red_invoice")).toBe(true);
    expect(hasJoined([redInvoice], "red_invoice")).toBe(false);
    expect(hasJoined([redInvoice, deduction], "red_invoice")).toBe(false);
  });
});

const anthropic = { id: "a", label: "Anthropic, PBC · Nov 5, 2026", seller: "Anthropic, PBC", boughtOn: "2026-11-05", currency: "usd", amount: 11111, removed: false, documents: [receipt] };
const highlands = { id: "h", label: "Highlands Coffee · Nov 5, 2026", seller: "Highlands Coffee", boughtOn: "2026-11-05", currency: "vnd", amount: 500000, removed: false, documents: [receipt] };

describe("the receipts a bank deduction may join", () => {
  const lone = { seller: "ANTHROPIC* CLAUDE SUB", boughtOn: "2026-11-06", amount: 2937648 };

  it("offers a receipt in another currency with no deduction yet", () => {
    expect(joinTargets(lone, "bank_deduction", [anthropic, highlands]).map((t) => t.id)).toEqual(["a"]);
  });

  it("leaves out a removed receipt, one already joined, and another row on its own", () => {
    const items = [
      { ...anthropic, id: "gone", removed: true },
      { ...anthropic, id: "joined", documents: [receipt, deduction] },
      { ...anthropic, id: "lone", documents: [deduction] },
    ];
    expect(joinTargets(lone, "bank_deduction", items)).toEqual([]);
  });

  it("reads a removal as the claim page holds it, and hands back the page's own rows", () => {
    const kept = { ...anthropic, removed: null };
    const gone = { ...anthropic, id: "gone", removed: { at: "2026-11-06T00:00:00Z", reason: null } };
    const targets = joinTargets(lone, "bank_deduction", [kept, gone]);
    expect(targets).toEqual([kept]);
    expect(targets[0]).toBe(kept);
  });

  it("offers a receipt abroad with no document, which a lost-receipt note explains", () => {
    expect(joinTargets(lone, "bank_deduction", [{ ...anthropic, documents: [] }]).map((t) => t.id)).toEqual(["a"]);
  });

  it("puts the seller the bank names first, then the nearest date", () => {
    const items = [
      { ...anthropic, id: "far", seller: "Notion Labs", boughtOn: "2026-11-06" },
      { ...anthropic, id: "anthropic-old", boughtOn: "2026-10-05" },
      { ...anthropic, id: "anthropic" },
    ];
    expect(joinTargets(lone, "bank_deduction", items).map((t) => t.id)).toEqual(["anthropic", "anthropic-old", "far"]);
  });
});

describe("the receipts a red invoice may join", () => {
  const lone = { seller: "CÔNG TY TNHH HIGHLANDS COFFEE", boughtOn: "2026-11-05", amount: 500000 };

  it("offers a dong receipt with no red invoice yet, never one abroad", () => {
    expect(joinTargets(lone, "red_invoice", [anthropic, highlands]).map((t) => t.id)).toEqual(["h"]);
    expect(joinTargets(lone, "red_invoice", [{ ...highlands, documents: [receipt, redInvoice] }])).toEqual([]);
  });

  it("puts the receipt of the same amount first", () => {
    const items = [{ ...highlands, id: "other", amount: 120000 }, { ...highlands, id: "same", seller: "Phở Thìn" }];
    expect(joinTargets(lone, "red_invoice", items).map((t) => t.id)).toEqual(["same", "other"]);
  });
});

describe("why a join is refused", () => {
  const ok = { lone: { amount: 2937648, documents: [deduction] }, receipt: { currency: "usd", amount: 11111, removed: false, documents: [receipt] } };
  const invoice = { lone: { amount: 500000, documents: [redInvoice] }, receipt: { currency: "vnd", amount: 500000, removed: false, documents: [receipt] } };

  it("lets a lone deduction join a receipt abroad, and a lone red invoice a dong receipt", () => {
    expect(joinRefusal(ok)).toBeNull();
    expect(joinRefusal(invoice)).toBeNull();
  });

  it("refuses a row that is not on its own", () => {
    expect(joinRefusal({ ...ok, lone: { ...ok.lone, documents: [receipt] } })).toMatch(/not a bank deduction or a red invoice/);
  });

  it("refuses a deduction with no amount, and a receipt with none", () => {
    expect(joinRefusal({ ...ok, lone: { ...ok.lone, amount: 0 } })).toMatch(/bank deduction has no amount/);
    expect(joinRefusal({ ...ok, receipt: { ...ok.receipt, amount: 0 } })).toMatch(/receipt has no amount/);
  });

  it("refuses the wrong currency, a removed receipt, and one that has its document", () => {
    expect(joinRefusal({ ...ok, receipt: { ...ok.receipt, currency: "vnd" } })).toMatch(/another currency/);
    expect(joinRefusal({ ...invoice, receipt: { ...invoice.receipt, currency: "usd" } })).toMatch(/bought in Vietnam/);
    expect(joinRefusal({ ...ok, receipt: { ...ok.receipt, removed: true } })).toMatch(/removed/);
    expect(joinRefusal({ ...ok, receipt: { ...ok.receipt, documents: [receipt, deduction] } })).toMatch(/already has its bank deduction/);
    expect(joinRefusal({ ...invoice, receipt: { ...invoice.receipt, documents: [receipt, redInvoice] } })).toMatch(/already has its red invoice/);
  });

  it("refuses joining one lone row to another", () => {
    expect(joinRefusal({ ...ok, receipt: { ...ok.receipt, documents: [deduction] } })).toMatch(/Pick a receipt/);
  });
});
