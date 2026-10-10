// Server-only. Small pieces the team assistant's tool bodies share: reading
// a period from tool input, a safe ILIKE pattern, naming people, and finding
// one business by name.

import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { escapeLikeLiteral } from "@/kernel/data/postgrest-filter";
import { saigonToday } from "@/kernel/config/dates";
import { NAME_ONLY_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import { selectCompanies } from "@/kernel/identity/reads";

export type ToolInput = Record<string, unknown>;
export type ToolOutcome = { content: string; isError: boolean };

export const text = (input: ToolInput, key: string): string =>
  typeof input[key] === "string" ? (input[key] as string).trim() : "";

export const ok = (body: unknown): ToolOutcome => ({ content: JSON.stringify(body), isError: false });
export const refuse = (message: string): ToolOutcome => ({ content: message, isError: true });

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A period from `from`/`to`, defaulting to this month so far (Saigon calendar). */
export function periodOf(input: ToolInput): { from: string; to: string } {
  const today = saigonToday();
  const from = DATE.test(text(input, "from")) ? text(input, "from") : `${today.slice(0, 8)}01`;
  const to = DATE.test(text(input, "to")) ? text(input, "to") : today;
  return { from, to };
}

/** `%term%` with the term's own wildcards escaped. */
export const contains = (term: string): string => `%${escapeLikeLiteral(term)}%`;

/** Display names for people ids (staff: deal owners, idea authors, people on leave). */
export async function namesFor(personIds: (string | null)[]): Promise<Map<string, string>> {
  const ids = [...new Set(personIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map();
  const rows = mustRows(
    await companyOs.from("people").select(`id, ${NAME_ONLY_COLUMNS}`).in("id", ids),
    "[team/chat] people names",
  ) as (NamedPerson & { id: string })[];
  return new Map(rows.map((p) => [p.id, personName(p)]));
}

/** Business names for company ids. Business names are not personal data. */
export async function companyNamesFor(companyIds: (string | null)[]): Promise<Map<string, string>> {
  const ids = [...new Set(companyIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map();
  const rows = mustRows(await selectCompanies("id, name").in("id", ids), "[team/chat] company names") as {
    id: string;
    name: string;
  }[];
  return new Map(rows.map((c) => [c.id, c.name]));
}

export type FoundCompany = { ok: true; id: string; name: string } | { ok: false; outcome: ToolOutcome };

/**
 * One business by name: an exact (case-insensitive) match wins, else a single
 * partial match. Several matches come back as a list to ask about, which is
 * safe for anyone because business names are visible to everyone.
 */
export async function findCompany(name: string): Promise<FoundCompany> {
  if (!name) return { ok: false, outcome: refuse("Say which business you mean.") };
  const rows = mustRows(
    await selectCompanies("id, name").ilike("name", contains(name)).is("archived_at", null).order("name").limit(10),
    "[team/chat] company lookup",
  ) as { id: string; name: string }[];
  const exact = rows.filter((c) => c.name.toLowerCase() === name.toLowerCase());
  const pick = exact.length === 1 ? exact[0] : rows.length === 1 ? rows[0] : null;
  if (pick) return { ok: true, id: pick.id, name: pick.name };
  if (!rows.length) return { ok: false, outcome: refuse(`No business matches "${name}".`) };
  return {
    ok: false,
    outcome: refuse(`More than one business matches "${name}": ${rows.map((c) => c.name).join(", ")}. Ask which one.`),
  };
}

/** Sum cents by currency into display amounts. */
export function sumByCurrency(rows: { currency: string | null; cents: number | null }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const cur = (r.currency ?? "USD").toUpperCase();
    out[cur] = (out[cur] ?? 0) + (r.cents ?? 0);
  }
  for (const cur of Object.keys(out)) out[cur] = Math.round(out[cur]) / 100;
  return out;
}
