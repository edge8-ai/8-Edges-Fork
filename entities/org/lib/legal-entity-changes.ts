// A proposed change to a legal entity, checked as a whole against the row it
// changes: which fields moved, what each was before, and why any is refused.
//
// The drawer runs these on every keystroke to enable Save and to put each
// error under its field; the server actions run the same functions on the row
// they read before writing. Each returns only the fields that changed, so the
// write and its audit row name exactly what moved and nothing else, and a
// change that moves nothing is refused rather than recorded.
import { slugify } from "@/kernel/config/slug";
import {
  ADDRESS_MAX,
  NAME_MAX,
  checkCountry,
  checkCurrency,
  checkEntityType,
  checkIncorporatedOn,
  checkRegistrationNumber,
  checkSlug,
  checkTaxId,
  checkText,
  countryLabels,
  type FieldCheck,
} from "./legal-entity-rules";

/** company_os.legal_entities as these checks read it. */
export type LegalEntityRecord = {
  id: string;
  slug: string;
  name: string;
  legal_name: string | null;
  country: string | null;
  entity_type: string | null;
  base_currency: string;
  active: boolean;
  tax_id: string | null;
  registration_number: string | null;
  registered_address: string | null;
  legal_representative_person_id: string | null;
  jurisdiction: string | null;
  incorporated_on: string | null;
};

/** A checked change: the columns to write, and what each held before. */
export type ChangeCheck<C extends string> =
  | { ok: true; patch: Partial<Record<C, string | boolean>>; before: Partial<Record<C, string | boolean | null>> }
  | { ok: false; error: string; fields: Record<string, string> };

// ─── Registration details (org.legal-registration) ─────────────────────────

export type RegistrationInput = {
  taxId: string;
  registrationNumber: string;
  registeredAddress: string;
  legalRepresentativePersonId: string;
  jurisdiction: string;
  incorporatedOn: string;
};

export const REGISTRATION_COLUMNS = {
  taxId: "tax_id",
  registrationNumber: "registration_number",
  registeredAddress: "registered_address",
  legalRepresentativePersonId: "legal_representative_person_id",
  jurisdiction: "jurisdiction",
  incorporatedOn: "incorporated_on",
} as const satisfies Record<keyof RegistrationInput, keyof LegalEntityRecord>;

export type RegistrationColumn = (typeof REGISTRATION_COLUMNS)[keyof RegistrationInput];

/** What each registration field is called for this entity's country. */
export function registrationLabels(country: string | null): Record<keyof RegistrationInput, string> {
  const labels = countryLabels(country);
  return {
    taxId: labels.taxId.label,
    registrationNumber: labels.registrationNumber.label,
    registeredAddress: "Registered address",
    legalRepresentativePersonId: "Legal representative",
    jurisdiction: labels.jurisdiction.label,
    incorporatedOn: "Incorporated on",
  };
}

function present(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function joinErrors(fields: Record<string, string>, labels: Record<string, string>): string {
  return Object.entries(fields)
    .map(([key, message]) => `${labels[key] ?? key}: ${message}`)
    .join(" ");
}

/**
 * Check the registration details against the row. A field left empty that was
 * never set stays unset; a field that was set cannot be emptied, because the
 * law requires it on record once it exists: it can only be corrected.
 * The legal representative must be someone on the team now, unless the change
 * leaves the current one in place.
 */
export function checkRegistration(
  record: LegalEntityRecord,
  input: RegistrationInput,
  context: { today: string; teamPeopleIds: ReadonlySet<string> },
): ChangeCheck<RegistrationColumn> {
  const labels = registrationLabels(record.country);
  const fields: Record<string, string> = {};
  const patch: Partial<Record<RegistrationColumn, string>> = {};
  const before: Partial<Record<RegistrationColumn, string | null>> = {};

  for (const key of Object.keys(REGISTRATION_COLUMNS) as (keyof RegistrationInput)[]) {
    const column = REGISTRATION_COLUMNS[key];
    const was = present(record[column] as string | null);
    const raw = (input[key] ?? "").trim();
    if (raw === "") {
      if (was !== null) fields[key] = "Once recorded it cannot be removed, because the law requires it on record. Correct it instead.";
      continue;
    }
    let checked: FieldCheck;
    switch (key) {
      case "taxId":
        checked = checkTaxId(record.country, raw);
        break;
      case "registrationNumber":
        checked = checkRegistrationNumber(record.country, raw);
        break;
      case "registeredAddress":
        checked = checkText(labels.registeredAddress, raw, ADDRESS_MAX);
        break;
      case "jurisdiction":
        checked = checkText(labels.jurisdiction, raw, NAME_MAX);
        break;
      case "incorporatedOn":
        checked = checkIncorporatedOn(raw, context.today);
        break;
      case "legalRepresentativePersonId":
        // Keeping the person already named is always allowed, even after they
        // leave: the row then flags them, and the fix is to name someone else.
        checked = raw === was || context.teamPeopleIds.has(raw) ? { ok: true, value: raw } : { ok: false, error: "Choose someone on the team." };
        break;
    }
    if (!checked.ok) {
      fields[key] = checked.error;
      continue;
    }
    if (checked.value !== was) {
      patch[column] = checked.value;
      before[column] = was;
    }
  }

  if (Object.keys(fields).length > 0) return { ok: false, error: joinErrors(fields, labels), fields };
  if (Object.keys(patch).length === 0) return { ok: false, error: "Nothing changed.", fields: {} };
  return { ok: true, patch, before };
}

// ─── The company itself (org.legal-entities) ───────────────────────────────

export type CompanyInput = { name: string; legalName: string; entityType: string; baseCurrency: string; active: boolean };

export type CompanyColumn = "name" | "legal_name" | "entity_type" | "base_currency" | "active";

export const COMPANY_LABELS: Record<keyof CompanyInput, string> = {
  name: "Name",
  legalName: "Registered legal name",
  entityType: "Type",
  baseCurrency: "Currency",
  active: "Active",
};

/** Check a change to the company's name, legal name, type, currency or active flag. */
export function checkCompany(record: LegalEntityRecord, input: CompanyInput): ChangeCheck<CompanyColumn> {
  const fields: Record<string, string> = {};
  const checks: [keyof CompanyInput, CompanyColumn, FieldCheck][] = [
    ["name", "name", checkText(COMPANY_LABELS.name, input.name ?? "", NAME_MAX)],
    ["legalName", "legal_name", checkText(COMPANY_LABELS.legalName, input.legalName ?? "", NAME_MAX)],
    ["entityType", "entity_type", checkEntityType(input.entityType ?? "", record.entity_type)],
    ["baseCurrency", "base_currency", checkCurrency(input.baseCurrency ?? "")],
  ];
  const patch: Partial<Record<CompanyColumn, string | boolean>> = {};
  const before: Partial<Record<CompanyColumn, string | boolean | null>> = {};
  for (const [key, column, checked] of checks) {
    if (!checked.ok) {
      fields[key] = checked.error;
      continue;
    }
    const was = present(record[column] as string | null);
    if (checked.value !== was) {
      patch[column] = checked.value;
      before[column] = was;
    }
  }
  if (typeof input.active === "boolean" && input.active !== record.active) {
    patch.active = input.active;
    before.active = record.active;
  }
  if (Object.keys(fields).length > 0) return { ok: false, error: joinErrors(fields, COMPANY_LABELS), fields };
  if (Object.keys(patch).length === 0) return { ok: false, error: "Nothing changed.", fields: {} };
  return { ok: true, patch, before };
}

// ─── A new legal entity (org.legal-entities) ───────────────────────────────

export type NewEntityInput = { slug: string; name: string; legalName: string; country: string; entityType: string; baseCurrency: string };

export type NewEntityRow = { slug: string; name: string; legal_name: string; country: string; entity_type: string; base_currency: string };

const NEW_LABELS: Record<keyof NewEntityInput, string> = { ...COMPANY_LABELS, slug: "Address", country: "Country" };

/** The slug a new entity gets from its name. The action refuses one already taken. */
export function slugForName(name: string): string {
  return slugify(name);
}

/** Check a new entity's fields; registration details are added afterwards, by whoever keeps them. */
export function checkNewEntity(
  input: NewEntityInput,
): { ok: true; row: NewEntityRow } | { ok: false; error: string; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const value = (key: keyof NewEntityInput, checked: FieldCheck): string => {
    if (checked.ok) return checked.value;
    fields[key] = checked.error;
    return "";
  };
  const row: NewEntityRow = {
    name: value("name", checkText(NEW_LABELS.name, input.name ?? "", NAME_MAX)),
    slug: value("slug", checkSlug(input.slug ?? "")),
    legal_name: value("legalName", checkText(NEW_LABELS.legalName, input.legalName ?? "", NAME_MAX)),
    country: value("country", checkCountry(input.country ?? "")),
    entity_type: value("entityType", checkEntityType(input.entityType ?? "")),
    base_currency: value("baseCurrency", checkCurrency(input.baseCurrency ?? "")),
  };
  if (Object.keys(fields).length > 0) return { ok: false, error: joinErrors(fields, NEW_LABELS), fields };
  return { ok: true, row };
}
