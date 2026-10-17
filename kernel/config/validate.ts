// Hand-written input narrowing shared by the public forms and admin actions.
// No schema library in this repo — see the engineering conventions.

// Deliberately loose: one "@", no whitespace, at least one dot in the domain.
// Real validation is the confirmation email; this only rejects obvious typos.
export function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
