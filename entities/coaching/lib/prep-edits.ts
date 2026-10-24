// The member's amendments to the shared prep (K.21): pure rules, so both pages
// render the same agenda from the same two inputs, the coach's markdown and
// the member's edits, and the writer can validate without a database.
//
// The coach's words are never rewritten. A struck bullet is still the coach's
// bullet, shown struck; an added line is the member's, shown as theirs.

export type PrepEdits = { struck: string[]; added: string[] };

export const MAX_ADDED = 20;
export const MAX_LINE = 300;

// The top-level bullets of the shared prep, in order. Only "- " and "* " lines
// count: a heading or a paragraph is context, not something to strike.
export function parsePrepBullets(markdown: string | null): string[] {
  if (!markdown) return [];
  return markdown
    .split(/\r?\n/)
    .map((l) => l.match(/^\s{0,3}[-*]\s+(.*\S)\s*$/)?.[1] ?? null)
    .filter((l): l is string => l !== null);
}

export function normaliseEdits(raw: unknown): PrepEdits {
  const r = (raw ?? {}) as { struck?: unknown; added?: unknown };
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean) : [];
  return { struck: strings(r.struck), added: strings(r.added) };
}

export type AgendaLine = { text: string; struck: boolean; mine: boolean };

// The agenda as both pages show it: the coach's bullets with the member's
// strikes applied, then the member's added lines. A strike that no longer
// matches a bullet (the coach regenerated the prep) is simply dropped.
export function applyMemberEdits(bullets: string[], edits: PrepEdits): AgendaLine[] {
  const struck = new Set(edits.struck);
  return [
    ...bullets.map((text) => ({ text, struck: struck.has(text), mine: false })),
    ...edits.added.map((text) => ({ text, struck: false, mine: true })),
  ];
}

export function validatePrepEdits(edits: PrepEdits): { ok: true } | { ok: false; error: string } {
  if (edits.added.length > MAX_ADDED) return { ok: false, error: `Keep it to ${MAX_ADDED} added lines.` };
  for (const line of [...edits.added, ...edits.struck]) {
    if (line.length > MAX_LINE) return { ok: false, error: `Keep each line under ${MAX_LINE} characters.` };
  }
  return { ok: true };
}

export function hasEdits(edits: PrepEdits): boolean {
  return edits.struck.length > 0 || edits.added.length > 0;
}
