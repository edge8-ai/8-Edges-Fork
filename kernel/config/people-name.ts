// One place that decides how a person's name is written and ordered.
//
// company_os.people.full_name is not a consistent shape: it holds Vietnamese
// order ("Nguyễn Văn Hiếu" = Family Middle Given) for some people and Western
// order ("An Nguyen" = Given Family) for others, so its first token is a family
// name for one row and a given name for the next. Sorting or abbreviating it
// gives a different answer per person.
//
// people.display_name is the fix: Given + Family, in that order, using the name
// the person actually goes by. Everything user-facing reads it through
// personName() and orders with byFirstName().

export type NamedPerson = {
  display_name?: string | null;
  preferred_name?: string | null;
  full_name?: string | null;
  email?: string | null;
};

// The people columns personName() reads, for a select or an embed:
// `people!person_id(id, ${NAME_COLUMNS})`. Spelled once beside the type it
// fills, so a query cannot quietly omit the column the helper needs — without
// display_name, personName() silently degrades to the old full_name chain.
// greetingName() also reads first_name, so a greeting selects GREETING_COLUMNS.
export const NAME_COLUMNS = "display_name, preferred_name, full_name, email" as const;
/** The columns a person search matches a typed word against: every name a person goes by, and their email (S.1). */
export const PERSON_SEARCH_COLUMNS = ["full_name", "display_name", "preferred_name", "email"] as const;
export const GREETING_COLUMNS = `${NAME_COLUMNS}, first_name` as const;
// The name columns WITHOUT email, for a read whose name reaches someone who
// may not see that person's address — a contractor named to a client, say.
// personName() falls back to email last, so a nameless row selected with
// NAME_COLUMNS would put the address on screen (S.16.8 review).
export const NAME_ONLY_COLUMNS = "display_name, preferred_name, full_name" as const;

// A row greetingName() can address: the name columns plus the given name.
export type GreetedPerson = NamedPerson & { first_name?: string | null };

// Strips accents so "Đức" files under D and a search for "duc" finds "Đức".
// Đ/đ are not decomposable, so NFD leaves them behind and they need the
// explicit pass below.
export function foldDiacritics(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/Đ/g, "D")
    .replace(/đ/g, "d")
    .toLowerCase();
}

// What personName() returns for a row that carries no name and no email.
// Exported because a caller that must NOT show a placeholder has to recognise
// one, and comparing against a copy of the literal is how the two would drift.
export const UNNAMED = "Unnamed";

// What to show. display_name is authoritative; the rest is fallback for people
// who have never been through the roster (CRM contacts, old assignees).
//
// `placeholder` is the caller's own word for a person with no name and no email,
// or for no person at all (S.16): "(no name)", or null for a screen that hides
// the field. Without one, the kernel's own placeholders stand — "Unknown" for no
// person, UNNAMED for a nameless one.
export function personName<P extends string | null = string>(person: NamedPerson | null | undefined, placeholder?: P): string | P {
  const name =
    person?.display_name?.trim() || person?.preferred_name?.trim() || person?.full_name?.trim() || person?.email?.trim();
  if (name) return name;
  if (placeholder !== undefined) return placeholder;
  return person ? UNNAMED : "Unknown";
}

// First name first, because display_name puts the given name first. Falls
// through to the whole name so two people called Minh keep a stable order.
export function byFirstName(a: string, b: string): number {
  const af = foldDiacritics(a);
  const bf = foldDiacritics(b);
  const first = af.split(/\s+/)[0].localeCompare(bf.split(/\s+/)[0]);
  return first !== 0 ? first : af.localeCompare(bf);
}

// True when every whitespace-separated term in the query appears somewhere in
// the name, accent-insensitively. "ng th" matches "Thành Nguyễn".
export function matchesPersonQuery(name: string, query: string): boolean {
  const terms = foldDiacritics(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = foldDiacritics(name);
  return terms.every((t) => hay.includes(t));
}

// "The name" is three questions, not one (S.14, decided 2026-09-23), and each
// has its own verb here so no screen has to spell a chain of its own:
//
//   personName()   the name to SHOW beside a card, in a list, on a record.
//   greetingName() the name to ADDRESS someone by: "Morning Harry,".
//   legalName()    the name ON RECORD, for the directory and anything formal.
//
// They differ on purpose. A greeting wants the nickname a person asked for,
// which on a list would make two people hard to tell apart; the directory wants
// the name as recorded, in whatever order it was recorded, which is exactly
// what a list must not sort by. people-name.scope.test.ts holds the line.

// What to call someone: the nickname they asked for, then their given name —
// first_name, or the first word of display_name, which is Given + Family.
// A nickname is one word. preferred_name often holds the whole full name
// instead (21 of 29 set on 2026-09-23, 14 of them equal to full_name), so a
// multi-word preferred_name is skipped rather than greeted (S.16.15). One that
// equals display_name is the name the person goes by, whose first word may be a
// chosen name first_name does not hold ("Tony Tran" with first_name "Tuấn"), so
// that one greets by display_name's first word before first_name.
// Past that a greeting uses the caller's own word ("Hi there,"), never a full
// name or an email: full_name's first word is a family name for Vietnamese-
// order rows ("Hi Nguyễn,"), and "Hi john@x.com," is no greeting (Khoa,
// 2026-09-23). The word is required, so the kernel never chooses copy: "there"
// for an English salutation, null where the template supplies its own.
export function greetingName<P extends string | null>(
  person: GreetedPerson | null | undefined,
  placeholder: P,
): string | P {
  const preferred = person?.preferred_name?.trim();
  const nickname = preferred && !/\s/.test(preferred) ? preferred : undefined;
  const display = person?.display_name?.trim();
  const given = display?.split(/\s+/)[0];
  const goesBy = preferred && preferred === display ? given : undefined;
  const name = nickname || goesBy || person?.first_name?.trim() || given;
  return name || placeholder;
}

// The name as recorded. full_name is kept in whatever order the person gave it,
// which is right for a legal record and wrong for sorting; a person with none
// recorded falls back to the name to show rather than to a blank.
export function legalName<P extends string | null = string>(person: NamedPerson | null | undefined, placeholder?: P): string | P {
  return person?.full_name?.trim() || personName(person, placeholder);
}

// What the /team and /portal session actors carry as the signed-in person's
// name. It is NOT greetingName: actor.displayName is also how 38 call sites
// name that person to others — coach notifications ("X is stuck on …"), goal
// emails, the Workboard's audit label — so it must keep naming them in full
// where the old order did. S.16.15 made a greeting skip a multi-word
// preferred_name; that must not turn "Nguyễn Văn Hiếu" into "Hiếu" in an audit
// row. The actor carries its greeting apart (`greeting`, greetingName over the
// same row, S.16.17), so this keeps its original order for naming, and a
// person with nothing but a blank email is UNNAMED.
export function actorDisplayName(p: {
  preferred_name: string | null;
  first_name: string | null;
  full_name: string | null;
  email: string;
}): string {
  return p.preferred_name?.trim() || p.first_name?.trim() || p.full_name?.trim() || p.email.trim() || UNNAMED;
}
