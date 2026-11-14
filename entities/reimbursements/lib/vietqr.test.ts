import { describe, expect, it } from "vitest";
import { crc16, vietQrPayload, vietQrSvg } from "./vietqr";

// A VietQR code that says the wrong thing sends money the wrong way, so the
// payload is pinned against a vector worked out separately from this code, and
// anything the format cannot carry faithfully gives no code at all.
const BIN = "970436";
const ACCOUNT = "12345678";
const REFERENCE = "AD-0012 HOAN UNG";
const transfer = { bin: BIN, account: ACCOUNT, amountVnd: 2_500_000, reference: REFERENCE };
// Computed in Python from the published EMVCo and NAPAS layout, not by this module.
const EXPECTED = `00020101021238520010A00000072701220006${BIN}0108${ACCOUNT}0208QRIBFTTA5303704540725000005802VN62200816${REFERENCE}6304EBB0`;

/** Reads tag, length, value fields back, so a wrong length cannot pass by matching itself. */
function fieldsOf(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < text.length; ) {
    const length = Number(text.slice(i + 2, i + 4));
    out[text.slice(i, i + 2)] = text.slice(i + 4, i + 4 + length);
    i += 4 + length;
  }
  return out;
}

describe("crc16", () => {
  it("matches the published check value of CRC-16/CCITT-FALSE", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  it("keeps a leading zero", () => {
    // Found with the same Python as the vector above: the field is always four digits.
    expect(crc16("11")).toBe("0DD9");
  });
});

describe("vietQrPayload", () => {
  it("matches the vector worked out separately", () => {
    expect(vietQrPayload(transfer)).toBe(EXPECTED);
  });

  it("reads back as the bank, the account, the amount and the reference it was given", () => {
    const top = fieldsOf(vietQrPayload(transfer) as string);
    expect(top["01"]).toBe("12");
    expect(top["53"]).toBe("704");
    expect(top["54"]).toBe("2500000");
    expect(top["58"]).toBe("VN");
    expect(fieldsOf(top["62"])["08"]).toBe(REFERENCE);
    const payee = fieldsOf(top["38"]);
    expect(payee["00"]).toBe("A000000727");
    expect(payee["02"]).toBe("QRIBFTTA");
    expect(fieldsOf(payee["01"])).toEqual({ "00": BIN, "01": ACCOUNT });
  });

  it("closes with a check over everything before it", () => {
    const payload = vietQrPayload(transfer) as string;
    expect(payload.slice(-4)).toBe(crc16(payload.slice(0, -4)));
  });

  it.each([
    ["a bank code that is not six digits", { bin: "97043" }],
    ["an account with a space", { account: "1234 5678" }],
    ["an account longer than the code carries", { account: "1".repeat(20) }],
    ["no amount", { amountVnd: 0 }],
    ["a negative amount", { amountVnd: -1 }],
    ["a fractional amount", { amountVnd: 10.5 }],
    ["an amount too long for the field", { amountVnd: 10 ** 13 }],
    ["an empty reference", { reference: "" }],
    ["a reference too long for the field", { reference: "A".repeat(26) }],
    // A length counts bytes, so an accented letter would shift every field after it.
    ["a reference with an accent", { reference: "HOÀN ỨNG" }],
  ])("gives no code for %s", (_name, change) => {
    expect(vietQrPayload({ ...transfer, ...change })).toBeNull();
  });
});

describe("vietQrSvg", () => {
  it("draws an inline SVG", async () => {
    expect(await vietQrSvg(EXPECTED)).toContain("<svg");
  });
});
