import { describe, expect, it } from "vitest";
import { canBecomePayment, isCollectible, isPaid, isVoided } from "./invoice-status";

// The S.2/S.8 collision, pinned.
//
// Two modules asked "is this invoice still owed?" and meant different things.
// The fix is not one predicate — the two questions are genuinely different —
// so what these tests protect is that the DIFFERENCE stays deliberate: a state
// question answered by status, an amount question answered by balance, and one
// row (voided) that both must agree to exclude.

describe("canBecomePayment — the state question finance's mirror asks", () => {
  it("accepts a row the ledger still shows as open", () => {
    expect(canBecomePayment("overdue")).toBe(true);
    expect(canBecomePayment("sent")).toBe(true);
    expect(canBecomePayment("open")).toBe(true);
  });

  it("rejects one that is already paid, because no transition is left to make", () => {
    expect(canBecomePayment("paid")).toBe(false);
  });

  // The defect this module was written for. `status !== "paid"` let a voided
  // row into the candidate set, so a cancelled bill reinstated and settled in
  // QuickBooks would have announced invoice.paid — and crm's subscriber would
  // have raised that company to `customer` on the strength of it.
  it("rejects a voided row: a cancelled bill is never going to be collected", () => {
    expect(canBecomePayment("voided")).toBe(false);
  });

  it("treats a missing status as open rather than silently settled", () => {
    expect(canBecomePayment(null)).toBe(true);
    expect(canBecomePayment(undefined)).toBe(true);
  });
});

describe("isCollectible — the amount question crm's runway asks", () => {
  it("is decided by the balance, not the status", () => {
    // Still open on paper but nothing left to collect.
    expect(isCollectible({ status: "sent" }, 0)).toBe(false);
    // Partly paid: the status may read settled while a remainder is owed, and
    // the remainder is the only thing that can say how much.
    expect(isCollectible({ status: "paid" }, 25_000)).toBe(true);
  });

  it("excludes a voided row whatever its balance says", () => {
    expect(isCollectible({ status: "voided" }, 100_000)).toBe(false);
  });

  it("ignores a negative balance, which is an over-payment and not a receivable", () => {
    expect(isCollectible({ status: "sent" }, -5_000)).toBe(false);
  });
});

describe("the two questions stay deliberately different", () => {
  // If these ever collapse into each other, someone has "simplified" the
  // collision back into existence.
  it("disagree on a paid row carrying a remaining balance", () => {
    expect(canBecomePayment("paid")).toBe(false);
    expect(isCollectible({ status: "paid" }, 10_000)).toBe(true);
  });

  it("disagree on an open row with nothing left on it", () => {
    expect(canBecomePayment("sent")).toBe(true);
    expect(isCollectible({ status: "sent" }, 0)).toBe(false);
  });

  it("agree, and must agree, that a voided invoice is neither", () => {
    expect(canBecomePayment("voided")).toBe(false);
    expect(isCollectible({ status: "voided" }, 10_000)).toBe(false);
    expect(isVoided("voided")).toBe(true);
    expect(isPaid("voided")).toBe(false);
  });
});
