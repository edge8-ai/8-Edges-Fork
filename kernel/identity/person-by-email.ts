// The people behind an email address. Sign-ins, invites, survey answers and
// uploaded files all carry an address, while everything a person owns (an
// inbox, an approval they decided, a board comment) is keyed on people.id. The
// lookup had been copied inline across a dozen files (S.5, A.48), each escaping
// the address its own way, each choosing for itself whether an archived row
// counts, and several taking `.limit(1)` with no order, so a duplicated
// address answered whichever row Postgres happened to return. This is the one copy
// (A.56): every read of people by email goes through it, and
// kernel/data/like-literal-rail.test.ts fails a lookup spelled anywhere else.
//
// people.email keeps an address as it was typed (S.16.24), so the match is
// case-insensitive, and it is literal: ilikeLiteral escapes `%` and `_`, and an
// address holding `*`, which PostgREST reads as `%`, matches nobody (A.48).
// The same address can be on file more than once (B.28), so every match is
// answered, oldest first, and a caller that wants one takes the first.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { ilikeLiteral, ilikeLiteralCondition } from "@/kernel/data/postgrest-filter";

/**
 * Whether an archived person still answers to their address. "exclude" is the
 * default because an archived row is somebody the company has put away; a
 * caller that counts them says "include" where it calls, so the choice is
 * visible at the site rather than implied by a missing filter.
 */
export type ArchivedPeople = "exclude" | "include";

export type PeopleByEmailOptions = {
  /** The PostgREST column list. Defaults to "id" (the plural form also reads email, which it needs for its recheck). */
  columns?: string;
  archived?: ArchivedPeople;
};

/**
 * PostgREST's own response shape, so the caller says what a failed read means
 * with kernel/data/read: `mustRows` where "nobody" would be a wrong answer,
 * `readOr` where a fallback is a correct one, or its own branch on `error`.
 */
export type PeopleRead<R> = { data: R[]; error: null } | { data: null; error: { message: string } };

// PostgREST infers a row from a literal column list; a caller's own string
// erases that, so each caller names its row type instead (see contacts' reads.ts).
type Row = Record<string, unknown>;

/** The order every answer comes in: oldest first, the id breaking a tie, so "the first" is the same row on every read. */
function peopleRows(columns: string, archived: ArchivedPeople = "exclude") {
  const query = companyOs.from("people").select<string, Row>(columns);
  return archived === "include" ? query : query.is("archived_at", null);
}

const inFixedOrder = <Q extends { order(column: string, options: { ascending: boolean }): Q }>(query: Q): Q =>
  query.order("created_at", { ascending: true }).order("id", { ascending: true });

/** Every person whose email is this address, case aside, oldest first. A blank address matches nobody. */
export async function peopleByEmail<R = { id: string }>(email: string | null | undefined, options: PeopleByEmailOptions = {}): Promise<PeopleRead<R>> {
  const address = email?.trim();
  if (!address) return { data: [], error: null };
  const { data, error } = await inFixedOrder(ilikeLiteral(peopleRows(options.columns ?? "id", options.archived), "email", address));
  if (error) return { data: null, error };
  return { data: (data ?? []) as R[], error: null };
}

// An `or(...)` string travels in the URL, so a long list is read in groups.
const CHUNK = 50;

/**
 * Every person whose email is one of these addresses, case aside. Addresses
 * are trimmed, lower-cased and read once each; a blank one is dropped. Rows
 * come back oldest first within a group, and every row for one address comes
 * from the same group, so an address's own rows keep the fixed order.
 *
 * Each address is its own literal condition (ilikeLiteralCondition), so `_`
 * and `%` match only themselves and an address holding `*` is left out, which
 * is its "no match". The answer is still re-checked against the lower-cased
 * list in memory, the rule each plural caller used to spell for itself: the
 * filter narrows, the list decides. `email` is read for that recheck whether
 * or not `columns` names it.
 */
export async function peopleByEmails<R = { id: string; email: string | null }>(
  emails: readonly (string | null | undefined)[],
  options: PeopleByEmailOptions = {},
): Promise<PeopleRead<R>> {
  const wanted = [...new Set(emails.map((e) => e?.trim().toLowerCase()).filter((e): e is string => !!e))];
  const requested = options.columns ?? "id, email";
  const columns = /\bemail\b/.test(requested) ? requested : `${requested}, email`;
  const groups: string[][] = [];
  for (let i = 0; i < wanted.length; i += CHUNK) {
    const conditions = wanted
      .slice(i, i + CHUNK)
      .map((e) => ilikeLiteralCondition("email", e))
      .filter((c): c is string => c !== null);
    if (conditions.length > 0) groups.push(conditions);
  }
  const reads = await Promise.all(groups.map((conditions) => inFixedOrder(peopleRows(columns, options.archived).or(conditions.join(",")))));
  const failed = reads.find((r) => r.error);
  if (failed?.error) return { data: null, error: failed.error };
  const listed = new Set(wanted);
  const rows = reads.flatMap((r) => (r.data ?? []) as Row[]).filter((p) => typeof p.email === "string" && listed.has(p.email.toLowerCase()));
  return { data: rows as R[], error: null };
}

/** people.id for this email: the oldest unarchived match, or null when nobody has it. A failed read raises. */
export async function personIdForEmail(email: string | null | undefined): Promise<string | null> {
  return mustRows(await peopleByEmail(email), "[identity] people by email")[0]?.id ?? null;
}

/**
 * The same lookup for a caller recording WHO did something after the fact
 * itself has landed (a decision, an approval row): a failed lookup is logged and
 * answers null, because the record without a name is still true and the action
 * it records must not fail over a name. `where` names the caller in the log.
 */
export async function personIdForEmailOrNull(email: string | null | undefined, where: string): Promise<string | null> {
  return personIdForEmail(email).catch((err) => {
    console.error(`[${where}] person by email`, err instanceof Error ? err.message : err);
    return null;
  });
}
