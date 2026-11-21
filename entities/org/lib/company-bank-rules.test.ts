import { describe, expect, it } from "vitest";
import { checkBankAccount } from "./company-bank-rules";
import { VN_BANKS, bankBinOf } from "./vn-banks";

const ACCOUNT = "12345678";
const good = { bankName: "Vietcombank", accountNumber: ACCOUNT, holder: "Acme Co., Ltd" };

describe("checkBankAccount", () => {
  it("accepts a complete account, tidied", () => {
    expect(checkBankAccount({ bankName: " Vietcombank ", accountNumber: " 1234 5678 ", holder: " Acme Co., Ltd " }, null)).toEqual({ ok: true, account: good });
  });

  it("puts each error under its own field", () => {
    const check = checkBankAccount({ bankName: "", accountNumber: "12", holder: " " }, null);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(Object.keys(check.fields).sort()).toEqual(["accountNumber", "bankName", "holder"]);
  });

  it("refuses a bank the list does not hold, which could have no QR code", () => {
    expect(checkBankAccount({ ...good, bankName: "Vietcombnak" }, null).ok).toBe(false);
  });

  it.each([["punctuation", "1234-5678"], ["too long for a QR code", "1".repeat(20)], ["too short", "123"]])("refuses an account number with %s", (_name, accountNumber) => {
    expect(checkBankAccount({ ...good, accountNumber }, null).ok).toBe(false);
  });

  it("refuses a change that moves nothing, even retyped with spaces", () => {
    expect(checkBankAccount({ ...good, accountNumber: "1234 5678" }, good)).toEqual({ ok: false, error: "Nothing changed.", fields: {} });
  });

  it("repeats no value in an error", () => {
    const check = checkBankAccount({ bankName: "Vietcombank", accountNumber: "9-9", holder: "Acme" }, null);
    expect(check.ok ? "" : check.error).not.toContain("9-9");
  });
});

describe("VN_BANKS", () => {
  it("gives every bank a six-digit code, and no two the same", () => {
    expect(VN_BANKS.every((b) => /^\d{6}$/.test(b.bin))).toBe(true);
    expect(new Set(VN_BANKS.map((b) => b.bin)).size).toBe(VN_BANKS.length);
    expect(new Set(VN_BANKS.map((b) => b.name)).size).toBe(VN_BANKS.length);
  });

  it("has no code for a name it does not hold", () => {
    expect(bankBinOf("Vietcombank")).toBe("970436");
    expect(bankBinOf("Nobody's Bank")).toBeNull();
    expect(bankBinOf("")).toBeNull();
  });
});
