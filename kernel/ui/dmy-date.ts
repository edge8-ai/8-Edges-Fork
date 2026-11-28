// A date typed as DD/MM/YYYY, the way people in Vietnam and Australia write
// one. The field takes digits only and puts the slashes in itself, so nobody
// has to type them or open a calendar to fix a date they already know.

/**
 * The text a DD/MM/YYYY field shows after a keystroke. Digits are kept (eight
 * at most) and the slashes are rebuilt around them; a slash is added after the
 * day and the month only while typing forward, so deleting past one is not
 * undone on the next render.
 */
export function maskDmy(typed: string, previous: string): string {
  const digits = typed.replace(/\D/g, "").slice(0, 8);
  let out = digits.slice(0, 2);
  if (digits.length > 2) out += `/${digits.slice(2, 4)}`;
  if (digits.length > 4) out += `/${digits.slice(4)}`;
  const forward = typed.length > previous.length;
  if (forward && (digits.length === 2 || digits.length === 4)) out += "/";
  return out;
}

/** A calendar date (YYYY-MM-DD) as DD/MM/YYYY. */
export function isoToDmy(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/**
 * DD/MM/YYYY as a calendar date (YYYY-MM-DD). A date that does not exist
 * (31/02) is refused rather than rolled into the next month, which is what
 * the Date constructor would do with it.
 */
export function parseDmy(text: string): { ok: true; iso: string } | { ok: false; error: string } {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!m) return { ok: false, error: "Type the date as DD/MM/YYYY." };
  const [, dd, mm, yyyy] = m;
  const at = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  if (at.getUTCFullYear() !== Number(yyyy) || at.getUTCMonth() !== Number(mm) - 1 || at.getUTCDate() !== Number(dd)) {
    return { ok: false, error: `${text.trim()} is not a real date.` };
  }
  return { ok: true, iso: `${yyyy}-${mm}-${dd}` };
}
