import { describe, expect, it } from "vitest";
import { CLAIM_CURRENCIES, formatOriginal, isClaimCurrency, minorFromTyped, typedFromMinor, vndAt } from "./currencies";

// A receipt keeps its original amount in the currency's minor units (cents for
// a dollar, whole units for the yen, the won and the dong) and is valued in
// whole dong at a rate of VND per one unit of the currency (plan section 10).

describe("the currencies a receipt can be in", () => {
  it("lists the dong first and every currency the two banks quote", () => {
    expect(CLAIM_CURRENCIES[0]).toBe("vnd");
    for (const c of ["usd", "eur", "aud", "sgd", "jpy", "krw", "thb", "gbp", "cny"]) expect(isClaimCurrency(c)).toBe(true);
    expect(isClaimCurrency("xyz")).toBe(false);
  });
});

describe("minorFromTyped", () => {
  it("reads a typed amount in the currency's minor units", () => {
    expect(minorFromTyped("62.80", "aud")).toBe(6280);
    expect(minorFromTyped("62.8", "aud")).toBe(6280);
    expect(minorFromTyped("1,234.5", "usd")).toBe(123450);
    expect(minorFromTyped("5", "usd")).toBe(500);
    expect(minorFromTyped("3,400", "jpy")).toBe(3400);
    expect(minorFromTyped("1,840,000", "vnd")).toBe(1840000);
    expect(minorFromTyped("1.840.000 ₫", "vnd")).toBe(1840000);
  });

  it("refuses what is not an amount in that currency", () => {
    expect(minorFromTyped("", "usd")).toBeNull();
    expect(minorFromTyped("12.345", "usd")).toBeNull();
    expect(minorFromTyped("abc", "usd")).toBeNull();
    expect(minorFromTyped("3400.5", "jpy")).toBeNull();
  });
});

describe("typedFromMinor", () => {
  it("is what the form shows when a receipt is edited", () => {
    expect(typedFromMinor(6280, "aud")).toBe("62.80");
    expect(typedFromMinor(3400, "jpy")).toBe("3400");
    expect(typedFromMinor(1840000, "vnd")).toBe("1840000");
  });
});

describe("vndAt", () => {
  it("values minor units at a rate in whole dong, rounded half up", () => {
    // A$62.80 at Techcombank's 18,426 sell rate.
    expect(vndAt(6280, "aud", 18426)).toBe(1157153);
    // ¥3,400 at 168.37.
    expect(vndAt(3400, "jpy", 168.37)).toBe(572458);
    expect(vndAt(1, "usd", 50)).toBe(1);
    expect(vndAt(126000, "vnd", 1)).toBe(126000);
  });
});

describe("formatOriginal", () => {
  it("shows the amount as it was paid", () => {
    expect(formatOriginal(6280, "aud")).toBe("A$62.80");
    expect(formatOriginal(3400, "jpy")).toBe("¥3,400");
    expect(formatOriginal(126000, "vnd")).toBe("₫126,000");
  });
});
