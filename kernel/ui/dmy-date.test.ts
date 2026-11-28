import { describe, expect, it } from "vitest";
import { isoToDmy, maskDmy, parseDmy } from "./dmy-date";

// Types a string one character at a time, the way the field sees it.
function typeInto(keys: string, start = ""): string {
  let value = start;
  for (const k of keys) value = maskDmy(value + k, value);
  return value;
}

describe("maskDmy", () => {
  it("puts the slashes in while digits are typed", () => {
    expect(typeInto("01")).toBe("01/");
    expect(typeInto("0110")).toBe("01/10/");
    expect(typeInto("01102026")).toBe("01/10/2026");
  });

  it("keeps a slash the person typed themselves without doubling it", () => {
    expect(typeInto("01/10/2026")).toBe("01/10/2026");
  });

  it("drops letters and anything past eight digits", () => {
    expect(typeInto("0a1b1c0x2026999")).toBe("01/10/2026");
  });

  it("lets a deletion go back past a slash", () => {
    expect(maskDmy("01", "01/")).toBe("01");
    expect(maskDmy("01/1", "01/10")).toBe("01/1");
  });

  it("reformats a pasted date", () => {
    expect(maskDmy("29102026", "")).toBe("29/10/2026");
  });
});

describe("parseDmy", () => {
  it("reads a whole date", () => {
    expect(parseDmy("29/10/2026")).toEqual({ ok: true, iso: "2026-10-29" });
    expect(parseDmy("29/02/2028")).toEqual({ ok: true, iso: "2028-02-29" });
  });

  it("refuses a date that does not exist instead of rolling it over", () => {
    expect(parseDmy("31/02/2026")).toEqual({ ok: false, error: "31/02/2026 is not a real date." });
    expect(parseDmy("00/10/2026")).toEqual({ ok: false, error: "00/10/2026 is not a real date." });
    expect(parseDmy("12/13/2026")).toEqual({ ok: false, error: "12/13/2026 is not a real date." });
  });

  it("refuses a date that is not finished", () => {
    expect(parseDmy("29/10/")).toEqual({ ok: false, error: "Type the date as DD/MM/YYYY." });
  });
});

describe("isoToDmy", () => {
  it("writes a calendar date the way the field shows it", () => {
    expect(isoToDmy("2026-10-29")).toBe("29/10/2026");
  });
});
