// An office morning list's shape, its one rendering, and the helpers every
// owner uses to build its lines. The morning-lists routine (company-os)
// composes the lists; each entity builds the lines for the tables it owns,
// because only the owner reads its tables.
//
// The morning list's shape and its one rendering (the Lark notifications plan,
// 2026-11-18). Every line names who must act, what to do, and one link. A line
// with no person (an invoice falling due, who is out) is allowed only for the
// facts an office reads to plan its day.

import type { LarkMessage } from "@/kernel/messaging/lark";
import { companyOs } from "@/kernel/data/supabase";
import { GREETING_COLUMNS, greetingName, personName, type GreetedPerson } from "@/kernel/config/people-name";

export type ListLine = {
  /** Who must act: a first name, "No owner", or null for a planning fact. */
  who: string | null;
  /** What happened and what to do, in plain words. Never an id or a route path. */
  text: string;
  /** Where to do it: a path on the site, joined to the origin at render time. */
  href?: string;
};

export type ListSection = { title: string; lines: ListLine[] };

export type OfficeList = { title: string; sections: ListSection[] };

/** At most this many lines per person in a section; the rest fold into "and N more". */
export const PER_PERSON_CAP = 3;

/** Fold each person's lines past the cap into one "and N more" line. Planning facts (no person) are never folded. */
export function capLines(lines: ListLine[]): ListLine[] {
  const seen = new Map<string, number>();
  const out: ListLine[] = [];
  const folded = new Map<string, { count: number; href?: string }>();
  for (const line of lines) {
    if (line.who === null) {
      out.push(line);
      continue;
    }
    const key = line.who;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n <= PER_PERSON_CAP) out.push(line);
    else {
      const f = folded.get(key) ?? { count: 0, href: line.href };
      f.count += 1;
      folded.set(key, f);
    }
  }
  for (const [who, f] of folded) out.push({ who, text: `and ${f.count} more.`, href: f.href });
  return out;
}

/** Whether a list has anything in it. An empty list is never sent. */
export function isEmpty(list: OfficeList): boolean {
  return list.sections.every((s) => s.lines.length === 0);
}

/** One line as Lark markdown: bold name, the text, and a named link. */
export function renderLine(line: ListLine, origin: string): string {
  const who = line.who ? `**${line.who}:** ` : "";
  const link = line.href && origin ? ` [Open](${origin}${line.href})` : "";
  return `- ${who}${line.text}${link}`;
}

/** The list as one Lark card: a header, then a bold heading and its lines per non-empty section. */
export function renderList(list: OfficeList, origin: string): LarkMessage {
  const blocks = list.sections
    .filter((s) => s.lines.length > 0)
    .map((s) => [`**${s.title}**`, ...capLines(s.lines).map((l) => renderLine(l, origin))].join("\n"));
  return {
    card: {
      config: { wide_screen_mode: true },
      header: { title: { tag: "plain_text", content: list.title } },
      elements: [{ tag: "markdown", content: blocks.join("\n\n") }],
    },
  };
}

/** "19 Nov". */
export function shortDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** "Thu 19 Nov". */
export function dayTitle(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/** "1 lead" / "17 leads". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}


const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PersonRow = GreetedPerson & { id: string; email: string | null; metadata: { is_ai?: boolean } | null };

/**
 * The name each person goes by, keyed by the id or email given, for the "who"
 * of a line. Some tables record their creator as an email, the rest as a
 * people id, so both are accepted. greetingName, not the first word of
 * full_name, which is a family name for Vietnamese-order rows. Unknown people
 * and AI personas (who cannot act on a list) are left out.
 */
export async function firstNames(keys: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(keys.filter((k): k is string => !!k))];
  const emails = unique.filter((k) => k.includes("@")).map((e) => e.toLowerCase());
  // Agents record themselves by name ("writer-agent"); only people ids are looked up.
  const ids = unique.filter((k) => UUID.test(k));
  const names = new Map<string, string>();
  const cols = `id, metadata, ${GREETING_COLUMNS}`;
  const reads = [
    ids.length ? companyOs.from("people").select(cols).in("id", ids) : null,
    emails.length ? companyOs.from("people").select(cols).in("email", emails) : null,
  ];
  for (const read of reads) {
    if (!read) continue;
    const { data, error } = await read;
    if (error) throw new Error(`[morning-lists] people: ${error.message}`);
    for (const p of (data ?? []) as unknown as PersonRow[]) {
      if (p.metadata?.is_ai) continue;
      const name = greetingName(p, null) ?? personName({ ...p, email: null }, null);
      if (!name) continue;
      names.set(p.id, name);
      if (p.email) names.set(p.email.toLowerCase(), name);
    }
  }
  return names;
}

export const NO_OWNER = "No owner";

export type Row = Record<string, unknown>;

/** A read the list needs. A failed read fails the run rather than reading as a quiet morning. */
export async function rows(label: string, query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Row[]> {
  const { data, error } = await query;
  if (error) throw new Error(`[morning-lists] ${label}: ${error.message}`);
  return (data ?? []) as Row[];
}


/** Group rows by their owner's name; rows with no owner, or an unknown one, group under "No owner". */
export function byOwner<T extends Row>(items: T[], owner: (r: T) => string | null, names: Map<string, string>): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const r of items) {
    const id = owner(r);
    const who = (id && (names.get(id) ?? names.get(id.toLowerCase()))) || NO_OWNER;
    groups.set(who, [...(groups.get(who) ?? []), r]);
  }
  return groups;
}

