// The currencies a receipt can be paid in, and the arithmetic of its two
// amounts (plan section 10, design §1.1). The original amount is stored in the
// currency's minor units (`amount_cents`: cents for a dollar, whole units for
// the yen, the won and the dong); its value is whole dong at a rate of VND per
// one unit of the currency. No floats are stored: the arithmetic below scales
// the rate to an integer and rounds once, half up, in BigInt.
//
// The list is the dong plus every currency Techcombank or Vietcombank quotes a
// selling rate for (RB.10's probe, 2026-10-07). A currency neither bank quotes
// can still be valued by the card charge or by a checker's rate, but the
// picker does not offer one nobody could look up.
//
// Client-safe: the claim form renders its picker and reads typed amounts here.

export const CLAIM_CURRENCIES = [
  "vnd",
  "usd",
  "eur",
  "aud",
  "sgd",
  "jpy",
  "krw",
  "thb",
  "gbp",
  "cny",
  "hkd",
  "cad",
  "chf",
  "nzd",
  "myr",
  "inr",
  "dkk",
  "nok",
  "sek",
  "sar",
  "kwd",
  "rub",
] as const;

export type ClaimCurrency = (typeof CLAIM_CURRENCIES)[number];

export function isClaimCurrency(value: string): value is ClaimCurrency {
  return (CLAIM_CURRENCIES as readonly string[]).includes(value);
}

// Zero-decimal currencies: the minor unit is the unit (ISO 4217). Every other
// currency in the list has two decimals, except the Kuwaiti dinar's three.
const DIGITS: Partial<Record<string, number>> = { vnd: 0, jpy: 0, krw: 0, kwd: 3 };

/** How many decimals the currency's minor unit has. */
export function minorDigits(currency: string): number {
  return DIGITS[currency.toLowerCase()] ?? 2;
}

/**
 * The minor units of a typed amount, or null when it is not an amount in that
 * currency. Commas, spaces and currency signs are ignored; for a zero-decimal
 * currency dots that group thousands are separators too ("1.840.000 ₫" is how
 * Vietnamese receipts print it), and otherwise a dot is the decimal point,
 * with no more decimals than the currency has.
 */
export function minorFromTyped(typed: string, currency: string): number | null {
  const digits = minorDigits(currency);
  const cleaned = typed.replace(/[\s,₫$€£¥]/g, "").replace(/^[A-Za-z]{1,3}/, "");
  // A dot in a zero-decimal amount is a separator only where it groups thousands.
  const plain = digits === 0 && /^\d{1,3}(\.\d{3})+$/.test(cleaned) ? cleaned.replace(/\./g, "") : cleaned;
  const match = /^(\d+)(?:\.(\d*))?$/.exec(plain);
  if (!match) return null;
  const fraction = match[2] ?? "";
  if (fraction.length > digits) return null;
  const minor = Number(match[1] + fraction.padEnd(digits, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}

/** The typed form of stored minor units, for editing: "62.80", "3400". */
export function typedFromMinor(minor: number, currency: string): string {
  const digits = minorDigits(currency);
  if (digits === 0) return String(minor);
  const s = String(minor).padStart(digits + 1, "0");
  return `${s.slice(0, -digits)}.${s.slice(-digits)}`;
}

// A rate is scaled to an integer at this many decimals before multiplying.
// Bank rates carry at most two (the won's 20.2, the yen's 168.37); a checker's
// typed rate is held to the same six in its schema.
const RATE_SCALE = BigInt(1_000_000);

/**
 * The whole dong `minor` units of `currency` are worth at `rate` VND per one
 * unit, rounded half up. Exact: the rate is scaled to an integer and the
 * division done once in BigInt, so a value never lands a dong off on a float.
 */
export function vndAt(minor: number, currency: string, rate: number): number {
  const scaledRate = BigInt(Math.round(rate * Number(RATE_SCALE)));
  const numerator = BigInt(minor) * scaledRate;
  const denominator = BigInt(10 ** minorDigits(currency)) * RATE_SCALE;
  const two = BigInt(2);
  return Number((numerator * two + denominator) / (two * denominator));
}

/** The original amount as it was paid: "A$62.80", "¥3,400", "₫126,000". */
export function formatOriginal(minor: number, currency: string): string {
  const digits = minorDigits(currency);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minor / 10 ** digits);
}
