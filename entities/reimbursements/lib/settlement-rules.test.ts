import { describe, expect, it } from "vitest";
import { balanceOf, closeOf, outcomeOf, outstandingOf, payableOf, settlementApprovedOnCheck } from "./settlement-rules";

const A = 8_000_000;

describe("the three outcomes against an advance of 8,000,000", () => {
  // The figures the design's money-path test names: a run pays 0, 0 and 720,000.
  const CASES: [number, number, number, "spent_less" | "spent_exactly" | "spent_more", "to_return" | "settled", "approved" | "settled"][] = [
    [7_360_000, -640_000, 0, "spent_less", "to_return", "settled"],
    [8_000_000, 0, 0, "spent_exactly", "settled", "settled"],
    [8_720_000, 720_000, 720_000, "spent_more", "settled", "approved"],
    [0, -8_000_000, 0, "spent_less", "to_return", "settled"],
  ];

  for (const [spent, balance, payable, outcome, advanceStatus, claimStatus] of CASES) {
    it(`spent ${spent}`, () => {
      expect(balanceOf(spent, A)).toBe(balance);
      expect(payableOf(spent, A)).toBe(payable);
      expect(outcomeOf(balance)).toBe(outcome);
      expect(closeOf(spent, A)).toEqual({ spentVnd: spent, balanceVnd: balance, payableVnd: payable, advanceStatus, claimStatus });
    });
  }

  it("never lets a claim be approved for nothing, so a run never makes a 0 payment", () => {
    for (const spent of [0, 1, 7_999_999, 8_000_000]) expect(closeOf(spent, A).claimStatus).toBe("settled");
    expect(closeOf(8_000_001, A)).toMatchObject({ claimStatus: "approved", payableVnd: 1 });
  });

  it("freezes the difference, never what was spent", () => {
    expect(closeOf(8_720_000, A).payableVnd).not.toBe(8_720_000);
  });
});

describe("outstandingOf", () => {
  it("is what is still owed as returns come back", () => {
    expect(outstandingOf(-640_000, 0)).toBe(640_000);
    expect(outstandingOf(-640_000, 400_000)).toBe(240_000);
    expect(outstandingOf(-640_000, 640_000)).toBe(0);
  });

  it("is nothing when the person owes nothing", () => {
    expect(outstandingOf(0, 0)).toBe(0);
    expect(outstandingOf(720_000, 0)).toBe(0);
  });

  it("never goes below zero", () => {
    expect(outstandingOf(-640_000, 700_000)).toBe(0);
  });
});

describe("settlementApprovedOnCheck", () => {
  it("reads the new money against the limit, not the spend", () => {
    expect(settlementApprovedOnCheck(8_720_000, A)).toBe(true);
    expect(settlementApprovedOnCheck(7_360_000, A)).toBe(true);
  });

  it("sends the limit itself and above to the approver", () => {
    expect(settlementApprovedOnCheck(A + 4_999_999, A)).toBe(true);
    expect(settlementApprovedOnCheck(A + 5_000_000, A)).toBe(false);
  });
});

describe("the amounts must be whole VND", () => {
  it("refuses a fraction, a negative and a NaN rather than computing money from them", () => {
    expect(() => balanceOf(1.5, A)).toThrow();
    expect(() => balanceOf(-1, A)).toThrow();
    expect(() => balanceOf(Number.NaN, A)).toThrow();
    expect(() => payableOf(1, Number.POSITIVE_INFINITY)).toThrow();
    expect(() => outstandingOf(-1, -1)).toThrow();
  });
});
