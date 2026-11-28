import { describe, expect, it } from "vitest";
import { checkCompany, checkNewEntity, checkRegistration, slugForName, type LegalEntityRecord, type RegistrationInput } from "./legal-entity-changes";

// Made-up companies, numbers and people; nothing here is a real record.
const VN: LegalEntityRecord = {
  id: "le-vn",
  slug: "acme-vn",
  name: "Acme Vietnam",
  legal_name: "Acme Vietnam Co., Ltd",
  country: "VN",
  entity_type: "corporation",
  base_currency: "vnd",
  active: true,
  tax_id: null,
  registration_number: null,
  registered_address: null,
  legal_representative_person_id: null,
  jurisdiction: null,
  incorporated_on: null,
};

const BLANK: RegistrationInput = { taxId: "", registrationNumber: "", registeredAddress: "", legalRepresentativePersonId: "", jurisdiction: "", incorporatedOn: "" };
const CONTEXT = { today: "2026-10-08", teamPeopleIds: new Set(["person-1", "person-2"]) };

describe("checkRegistration", () => {
  it("returns only the fields that changed, with what each held before", () => {
    const res = checkRegistration(VN, { ...BLANK, taxId: "0101234567", jurisdiction: " Ho Chi Minh City " }, CONTEXT);
    expect(res).toEqual({
      ok: true,
      patch: { tax_id: "0101234567", jurisdiction: "Ho Chi Minh City" },
      before: { tax_id: null, jurisdiction: null },
    });
  });

  it("takes every field at once", () => {
    const res = checkRegistration(
      VN,
      {
        taxId: "0101234567",
        registrationNumber: "0101234567",
        registeredAddress: "1 Example Street, District 1",
        legalRepresentativePersonId: "person-1",
        jurisdiction: "Ho Chi Minh City",
        incorporatedOn: "2019-03-14",
      },
      CONTEXT,
    );
    expect(res.ok && Object.keys(res.patch).sort()).toEqual(
      ["incorporated_on", "jurisdiction", "legal_representative_person_id", "registered_address", "registration_number", "tax_id"],
    );
  });

  it("refuses a change that moves nothing", () => {
    expect(checkRegistration(VN, BLANK, CONTEXT)).toEqual({ ok: false, error: "Nothing changed.", fields: {} });
    const set = { ...VN, tax_id: "0101234567" };
    expect(checkRegistration(set, { ...BLANK, taxId: " 0101234567 " }, CONTEXT)).toEqual({ ok: false, error: "Nothing changed.", fields: {} });
  });

  it("refuses to blank a field once recorded, saying why", () => {
    const res = checkRegistration({ ...VN, tax_id: "0101234567" }, BLANK, CONTEXT);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.fields.taxId).toBe("Once recorded it cannot be removed, because the law requires it on record. Correct it instead.");
    expect(!res.ok && res.error).toMatch(/^Tax code \(mã số thuế\): Once recorded it cannot be removed/);
  });

  it("holds the tax code and registration number to the country's format, naming each field", () => {
    const res = checkRegistration(VN, { ...BLANK, taxId: "12-3456789", registrationNumber: "x" }, CONTEXT);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.fields).toEqual({
      taxId: "10 digits, or 10 digits, a dash and 3 for a branch.",
      registrationNumber: "10 digits, or 10 digits, a dash and 3 for a branch.",
    });
  });

  it("takes an EIN for a US entity and refuses a Vietnamese code", () => {
    const us = { ...VN, country: "US" };
    expect(checkRegistration(us, { ...BLANK, taxId: "12-3456789" }, CONTEXT).ok).toBe(true);
    const res = checkRegistration(us, { ...BLANK, taxId: "0101234567" }, CONTEXT);
    expect(!res.ok && res.error).toBe("EIN: 2 digits, a dash and 7 digits.");
  });

  it("refuses a date of incorporation in the future", () => {
    const res = checkRegistration(VN, { ...BLANK, incorporatedOn: "2026-10-09" }, CONTEXT);
    expect(!res.ok && res.fields.incorporatedOn).toBe("A company cannot be incorporated in the future.");
  });

  it("names a legal representative only from the current team", () => {
    expect(checkRegistration(VN, { ...BLANK, legalRepresentativePersonId: "person-2" }, CONTEXT).ok).toBe(true);
    const res = checkRegistration(VN, { ...BLANK, legalRepresentativePersonId: "stranger" }, CONTEXT);
    expect(!res.ok && res.fields.legalRepresentativePersonId).toBe("Choose someone on the team.");
  });

  it("keeps a representative who has since left, so other fields can still be saved", () => {
    const res = checkRegistration({ ...VN, legal_representative_person_id: "left-person" }, { ...BLANK, legalRepresentativePersonId: "left-person", taxId: "0101234567" }, CONTEXT);
    expect(res).toEqual({ ok: true, patch: { tax_id: "0101234567" }, before: { tax_id: null } });
  });
});

describe("checkCompany", () => {
  const same = { name: VN.name, legalName: VN.legal_name ?? "", entityType: "corporation", baseCurrency: "VND", active: true };

  it("returns the changed fields only", () => {
    expect(checkCompany(VN, { ...same, legalName: "Acme Vietnam Joint Stock Company" })).toEqual({
      ok: true,
      patch: { legal_name: "Acme Vietnam Joint Stock Company" },
      before: { legal_name: "Acme Vietnam Co., Ltd" },
    });
  });

  it("records a change of the active flag", () => {
    expect(checkCompany(VN, { ...same, active: false })).toEqual({ ok: true, patch: { active: false }, before: { active: true } });
  });

  it("refuses a change that moves nothing, reading currency case as the same", () => {
    expect(checkCompany(VN, same)).toEqual({ ok: false, error: "Nothing changed.", fields: {} });
  });

  it("refuses a blank name or legal name and an unknown type", () => {
    const res = checkCompany(VN, { ...same, name: " ", legalName: "", entityType: "guild" });
    expect(!res.ok && res.fields).toEqual({
      name: "Enter the name.",
      legalName: "Enter the registered legal name.",
      entityType: "Choose the company's type from the list.",
    });
  });
});

describe("checkNewEntity", () => {
  const input = { slug: "acme-sg", name: "Acme Singapore", legalName: "Acme Singapore Pte. Ltd.", country: "sg", entityType: "corporation", baseCurrency: "SGD" };

  it("normalises the country and currency", () => {
    expect(checkNewEntity(input)).toEqual({
      ok: true,
      row: { slug: "acme-sg", name: "Acme Singapore", legal_name: "Acme Singapore Pte. Ltd.", country: "SG", entity_type: "corporation", base_currency: "sgd" },
    });
  });

  it("refuses each missing or malformed field", () => {
    const res = checkNewEntity({ slug: "", name: "", legalName: "", country: "Singapore", entityType: "", baseCurrency: "S$" });
    expect(!res.ok && Object.keys(res.fields).sort()).toEqual(["baseCurrency", "country", "entityType", "legalName", "name", "slug"]);
  });

  it("derives the slug from the name, accents folded", () => {
    expect(slugForName("Công ty Acme Việt Nam")).toBe("cong-ty-acme-viet-nam");
  });
});
