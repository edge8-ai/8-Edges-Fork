import { describe, expect, it } from "vitest";
import {
  REASON_MIN_LENGTH,
  REGISTRATION_VALUE_MAX,
  checkCountry,
  checkCurrency,
  checkEntityType,
  checkIncorporatedOn,
  checkReason,
  checkRegistrationNumber,
  checkSlug,
  checkTaxId,
  countryLabels,
  entityTypeLabel,
} from "./legal-entity-rules";

// Fixture numbers are made up to fit the shape; none belongs to a real company.
const VN_RULE = "10 digits, or 10 digits, a dash and 3 for a branch.";

describe("checkTaxId for Vietnam", () => {
  it("accepts ten digits", () => {
    expect(checkTaxId("VN", "0101234567")).toEqual({ ok: true, value: "0101234567" });
  });

  it("accepts a branch: ten digits, a dash and three", () => {
    expect(checkTaxId("VN", "0101234567-001")).toEqual({ ok: true, value: "0101234567-001" });
  });

  it("trims the edges and nothing inside", () => {
    expect(checkTaxId("VN", "  0101234567 ")).toEqual({ ok: true, value: "0101234567" });
    expect(checkTaxId("VN", "01012 34567").ok).toBe(false);
  });

  it.each([
    ["nine digits", "010123456"],
    ["eleven digits", "01012345678"],
    ["a branch of two", "0101234567-01"],
    ["a branch of four", "0101234567-0001"],
    ["a branch with no dash", "0101234567001"],
    ["letters", "01012345AB"],
    ["a trailing dash", "0101234567-"],
  ])("refuses %s, saying the rule", (_case, value) => {
    expect(checkTaxId("VN", value)).toEqual({ ok: false, error: VN_RULE });
  });

  it("reads the country however it is cased", () => {
    expect(checkTaxId("vn", "0101234567").ok).toBe(true);
    expect(checkTaxId(" vn ", "123").ok).toBe(false);
  });
});

describe("checkTaxId for the United States", () => {
  it("accepts an EIN as the IRS prints it", () => {
    expect(checkTaxId("US", "12-3456789")).toEqual({ ok: true, value: "12-3456789" });
  });

  it.each([
    ["no dash", "123456789"],
    ["the dash in the wrong place", "123-456789"],
    ["too few digits", "12-345678"],
    ["a Vietnamese code", "0101234567"],
  ])("refuses %s", (_case, value) => {
    expect(checkTaxId("US", value)).toEqual({ ok: false, error: "2 digits, a dash and 7 digits." });
  });
});

describe("checkTaxId elsewhere", () => {
  it("accepts any non-empty text for a country with no stated format", () => {
    expect(checkTaxId("SG", " 201912345K ")).toEqual({ ok: true, value: "201912345K" });
  });

  it("treats a missing country as one with no stated format", () => {
    expect(checkTaxId(null, "anything").ok).toBe(true);
    expect(checkTaxId(undefined, "anything").ok).toBe(true);
  });

  it("refuses an empty value, naming the field the country's way", () => {
    expect(checkTaxId("SG", "   ")).toEqual({ ok: false, error: "Enter the tax number." });
    expect(checkTaxId("VN", "")).toEqual({ ok: false, error: "Enter the tax code." });
    expect(checkTaxId("US", "")).toEqual({ ok: false, error: "Enter the EIN." });
  });

  it("refuses a value longer than any registration number", () => {
    expect(checkTaxId("SG", "x".repeat(REGISTRATION_VALUE_MAX)).ok).toBe(true);
    expect(checkTaxId("SG", "x".repeat(REGISTRATION_VALUE_MAX + 1))).toEqual({ ok: false, error: `Use at most ${REGISTRATION_VALUE_MAX} characters.` });
  });
});

describe("checkRegistrationNumber", () => {
  it("holds a Vietnamese number to the tax code's shape", () => {
    expect(checkRegistrationNumber("VN", "0101234567")).toEqual({ ok: true, value: "0101234567" });
    expect(checkRegistrationNumber("VN", "0101234567-002").ok).toBe(true);
    expect(checkRegistrationNumber("VN", "BRC-123")).toEqual({ ok: false, error: VN_RULE });
  });

  it("takes any non-empty text elsewhere", () => {
    expect(checkRegistrationNumber("US", " 7654321 ")).toEqual({ ok: true, value: "7654321" });
    expect(checkRegistrationNumber("SG", "")).toEqual({ ok: false, error: "Enter the registration number." });
    expect(checkRegistrationNumber("US", "")).toEqual({ ok: false, error: "Enter the state file number." });
  });
});

describe("countryLabels", () => {
  it("names the fields the way Vietnam does", () => {
    const vn = countryLabels("VN");
    expect(vn.taxId.label).toBe("Tax code (mã số thuế)");
    expect(vn.registrationNumber.label).toBe("Business registration number (mã số doanh nghiệp)");
    expect(vn.jurisdiction.label).toBe("Province");
  });

  it("names the fields the way the United States does", () => {
    const us = countryLabels("US");
    expect(us.taxId.label).toBe("EIN");
    expect(us.registrationNumber.label).toBe("State file number");
    expect(us.jurisdiction.label).toBe("State of incorporation");
  });

  it("uses plain names for any other country", () => {
    const other = countryLabels("SG");
    expect([other.taxId.label, other.registrationNumber.label, other.jurisdiction.label]).toEqual(["Tax number", "Registration number", "Jurisdiction"]);
    expect(other.taxId.rule).toBeNull();
  });

  it("states the rule the check enforces", () => {
    for (const country of ["VN", "US"]) {
      const refused = checkTaxId(country, "1");
      expect(refused.ok).toBe(false);
      expect(countryLabels(country).taxId.rule).toBe(refused.ok ? null : refused.error);
    }
  });
});

describe("checkIncorporatedOn", () => {
  const today = "2026-10-08";

  it("accepts a past date and today", () => {
    expect(checkIncorporatedOn("2019-03-14", today)).toEqual({ ok: true, value: "2019-03-14" });
    expect(checkIncorporatedOn(today, today).ok).toBe(true);
  });

  it("refuses a date after today", () => {
    expect(checkIncorporatedOn("2026-10-09", today)).toEqual({ ok: false, error: "A company cannot be incorporated in the future." });
  });

  it.each(["2026-02-30", "14/03/2019", "2019-3-14", "yesterday"])("refuses %s as not a date", (value) => {
    expect(checkIncorporatedOn(value, today)).toEqual({ ok: false, error: "Enter the date as YYYY-MM-DD." });
  });
});

describe("the company's own fields", () => {
  it("stores a country upper case and a currency lower case", () => {
    expect(checkCountry(" vn ")).toEqual({ ok: true, value: "VN" });
    expect(checkCountry("VNM").ok).toBe(false);
    expect(checkCurrency("VND")).toEqual({ ok: true, value: "vnd" });
    expect(checkCurrency("dong").ok).toBe(false);
  });

  it("takes a type from the list, or the one already stored", () => {
    expect(checkEntityType("LLC")).toEqual({ ok: true, value: "llc" });
    expect(checkEntityType("gmbh").ok).toBe(false);
    expect(checkEntityType("gmbh", "gmbh")).toEqual({ ok: true, value: "gmbh" });
  });

  it("writes a type as words", () => {
    expect(entityTypeLabel("llc")).toBe("LLC");
    expect(entityTypeLabel("corporation")).toBe("Corporation");
    expect(entityTypeLabel("sole_proprietorship")).toBe("Sole proprietorship");
    expect(entityTypeLabel(null)).toBeNull();
  });

  it("takes a slug of lower-case words and dashes only", () => {
    expect(checkSlug("acme-vn")).toEqual({ ok: true, value: "acme-vn" });
    expect(checkSlug("").ok).toBe(false);
    expect(checkSlug("Acme VN").ok).toBe(false);
  });
});

describe("checkReason", () => {
  it(`asks for at least ${REASON_MIN_LENGTH} characters once trimmed`, () => {
    expect(checkReason("  abcd  ")).toEqual({ ok: false, error: "Say why, in at least 5 characters." });
    expect(checkReason("  abcde  ")).toEqual({ ok: true, value: "abcde" });
  });
});
