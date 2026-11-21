// What each field of a legal entity must look like, by the country that issued
// it, and what the screen calls it there.
//
// One pure module, read by both sides: the edit drawer runs it on every
// keystroke to say what is wrong next to the field, and the server actions run
// it again on what arrives, so a form that skipped the check (or a hand-made
// request) cannot store a value the screen would have refused. Two copies of a
// format rule drift apart; that is why there is one.
//
// Only the formats we can state exactly are checked. Elsewhere a value must
// simply be present: a wrong regex for a country we do not file in would refuse
// a real number, which is worse than accepting one we cannot verify.

/** A checked value, trimmed, or the sentence the field shows under itself. */
export type FieldCheck = { ok: true; value: string } | { ok: false; error: string };

/** The longest number any registration field stores. A registration number is never a paragraph. */
export const REGISTRATION_VALUE_MAX = 64;
/** The longest name, legal name or jurisdiction. */
export const NAME_MAX = 160;
/** The longest registered address. */
export const ADDRESS_MAX = 500;
/** The shortest reason a change is accepted with: long enough to say something. */
export const REASON_MIN_LENGTH = 5;
/** The longest reason. It is a sentence beside a name, not a memo. */
export const REASON_MAX_LENGTH = 1000;

type NumberFormat = { label: string; placeholder: string; rule: string; pattern: RegExp };
type Labelled = { label: string; placeholder: string };

type CountryProfile = {
  taxId: NumberFormat | Labelled;
  registrationNumber: NumberFormat | Labelled;
  jurisdiction: Labelled;
};

// Mã số thuế and mã số doanh nghiệp: ten digits for the enterprise, and a
// dependent unit (a branch) carries the parent's ten, a dash and its own three.
// Since 2015 the two are usually the same number.
const VN_NUMBER = /^\d{10}(-\d{3})?$/;
const VN_RULE = "10 digits, or 10 digits, a dash and 3 for a branch.";

// Keyed by ISO 3166-1 alpha-2, upper case, as company_os.legal_entities.country
// stores it.
const PROFILES: Record<string, CountryProfile> = {
  VN: {
    taxId: { label: "Tax code (mã số thuế)", placeholder: "10 digits, or 10 digits-3 for a branch", rule: VN_RULE, pattern: VN_NUMBER },
    registrationNumber: {
      label: "Business registration number (mã số doanh nghiệp)",
      placeholder: "Usually the same as the tax code",
      rule: VN_RULE,
      pattern: VN_NUMBER,
    },
    jurisdiction: { label: "Province", placeholder: "The province or city of registration" },
  },
  US: {
    // Employer Identification Number, as the IRS prints it: 12-3456789.
    taxId: { label: "EIN", placeholder: "12-3456789", rule: "2 digits, a dash and 7 digits.", pattern: /^\d{2}-\d{7}$/ },
    registrationNumber: { label: "State file number", placeholder: "As the Secretary of State issued it" },
    jurisdiction: { label: "State of incorporation", placeholder: "e.g. Delaware" },
  },
};

const OTHER: CountryProfile = {
  taxId: { label: "Tax number", placeholder: "" },
  registrationNumber: { label: "Registration number", placeholder: "" },
  jurisdiction: { label: "Jurisdiction", placeholder: "" },
};

function profileFor(country: string | null | undefined): CountryProfile {
  if (!country) return OTHER;
  return PROFILES[country.trim().toUpperCase()] ?? OTHER;
}

function hasRule(format: NumberFormat | Labelled): format is NumberFormat {
  return "pattern" in format;
}

/** A field's label, its example, and its rule in words when the country has one. */
export type FieldLabel = { label: string; placeholder: string; rule: string | null };

/** What the country-dependent fields are called, and what each must look like. */
export function countryLabels(country: string | null | undefined): {
  taxId: FieldLabel;
  registrationNumber: FieldLabel;
  jurisdiction: FieldLabel;
} {
  const profile = profileFor(country);
  const label = (f: NumberFormat | Labelled): FieldLabel => ({ label: f.label, placeholder: f.placeholder, rule: hasRule(f) ? f.rule : null });
  return { taxId: label(profile.taxId), registrationNumber: label(profile.registrationNumber), jurisdiction: label(profile.jurisdiction) };
}

/** The label with its gloss dropped and lower-cased, for use inside a sentence. */
function inSentence(label: string): string {
  const bare = label.split(" (")[0];
  return bare === bare.toUpperCase() ? bare : bare.toLowerCase();
}

function checkNumber(format: NumberFormat | Labelled, raw: string): FieldCheck {
  const value = raw.trim();
  if (value === "") return { ok: false, error: `Enter the ${inSentence(format.label)}.` };
  if (value.length > REGISTRATION_VALUE_MAX) return { ok: false, error: `Use at most ${REGISTRATION_VALUE_MAX} characters.` };
  if (hasRule(format) && !format.pattern.test(value)) return { ok: false, error: format.rule };
  return { ok: true, value };
}

/**
 * Check a tax number against its country's format. The value is trimmed and
 * nothing else: the number is copied exactly as the registration certificate
 * prints it, so a space or a missing dash inside it is an error to fix, not
 * something to guess at.
 */
export function checkTaxId(country: string | null | undefined, raw: string): FieldCheck {
  return checkNumber(profileFor(country).taxId, raw);
}

/** Check a business registration number, the same way. */
export function checkRegistrationNumber(country: string | null | undefined, raw: string): FieldCheck {
  return checkNumber(profileFor(country).registrationNumber, raw);
}

/** Free text that must be present and not run on: a name, an address, a jurisdiction. */
export function checkText(label: string, raw: string, max: number): FieldCheck {
  const value = raw.trim();
  if (value === "") return { ok: false, error: `Enter the ${inSentence(label)}.` };
  if (value.length > max) return { ok: false, error: `Use at most ${max} characters.` };
  return { ok: true, value };
}

/** A date of incorporation: a real calendar date, and not after today. */
export function checkIncorporatedOn(raw: string, today: string): FieldCheck {
  const value = raw.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
  if (!match || !date || date.toISOString().slice(0, 10) !== value) return { ok: false, error: "Enter the date as YYYY-MM-DD." };
  if (value > today) return { ok: false, error: "A company cannot be incorporated in the future." };
  return { ok: true, value };
}

/** The reason every change carries, trimmed; refused when it says next to nothing. */
export function checkReason(raw: string): FieldCheck {
  const value = raw.trim();
  if (value.length < REASON_MIN_LENGTH) return { ok: false, error: `Say why, in at least ${REASON_MIN_LENGTH} characters.` };
  if (value.length > REASON_MAX_LENGTH) return { ok: false, error: `Keep the reason under ${REASON_MAX_LENGTH} characters.` };
  return { ok: true, value };
}

/** An ISO 3166-1 alpha-2 country, stored upper case. */
export function checkCountry(raw: string): FieldCheck {
  const value = raw.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(value)) return { ok: false, error: "Use the two-letter country code, e.g. VN or US." };
  return { ok: true, value };
}

/** An ISO 4217 currency, stored lower case as base_currency always has been. */
export function checkCurrency(raw: string): FieldCheck {
  const value = raw.trim().toLowerCase();
  if (!/^[a-z]{3}$/.test(value)) return { ok: false, error: "Use the three-letter currency code, e.g. VND or USD." };
  return { ok: true, value };
}

/** The forms a legal entity takes, as entity_type stores them. */
export const ENTITY_TYPES = ["corporation", "llc", "partnership", "sole_proprietorship", "branch", "representative_office", "nonprofit", "other"] as const;

/** One of ENTITY_TYPES. A value already stored that is not on the list is kept, so an edit never forces a change of type. */
export function checkEntityType(raw: string, current: string | null = null): FieldCheck {
  const value = raw.trim().toLowerCase();
  if ((ENTITY_TYPES as readonly string[]).includes(value) || (current !== null && value === current)) return { ok: true, value };
  return { ok: false, error: "Choose the company's type from the list." };
}

// Abbreviations stay upper case; anything else is humanised.
const TYPE_ABBREVIATIONS = new Set(["llc", "llp", "lp", "plc", "jsc", "pte", "ltd"]);

/** An entity type as words: "llc" → "LLC", "sole_proprietorship" → "Sole proprietorship". */
export function entityTypeLabel(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  if (TYPE_ABBREVIATIONS.has(text.toLowerCase())) return text.toUpperCase();
  const words = text.replace(/[_-]+/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The slug a new entity is addressed by: lower-case words joined by single dashes. */
export function checkSlug(raw: string): FieldCheck {
  const value = raw.trim();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) || value.length > 80) {
    return { ok: false, error: "The name must contain letters or digits to make an address from." };
  }
  return { ok: true, value };
}
