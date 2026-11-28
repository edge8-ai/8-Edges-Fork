import { foldDiacritics } from "@/kernel/config/fold";
import { shownNameFromParts } from "@/kernel/config/people-name";

// Goes by is people.preferred_name: the one-word nickname the shown name puts
// in brackets, "Given Family (Nickname)" (S.23). The template drops a value of
// more than one word, because that column often held a whole name instead
// (S.16.15). On 2026-11-16 whole names were typed into it from the Team drawer
// ("Given Family (Nickname)", and given-plus-family again), each was dropped,
// and the shown name did not change. So the drawer refuses such a value, says
// why, and offers the edit that was meant (S.23.5). The server action refuses
// it too, with GOES_BY_ONE_WORD, so the column never takes a full name again.

export const GOES_BY_ONE_WORD =
  "Goes by holds one word, the name people call them. Put a full name in Given name and Family name.";

// A team member's shown name needs both parts, so the drawer and the server
// action refuse to clear either one, in the same words.
export const NAME_PART_REQUIRED = {
  first_name: "Enter a given name.",
  last_name: "Enter a family name.",
} as const;

export type NameParts = { first_name?: string | null; last_name?: string | null; preferred_name?: string | null };

// Why the server action refuses a name part, or null. The value arrives
// trimmed, with a blank as null.
export function namePartRefusal(key: string, value: string | null): string | null {
  if (key === "preferred_name" && value && /\s/.test(value)) return GOES_BY_ONE_WORD;
  if ((key === "first_name" || key === "last_name") && !value) return NAME_PART_REQUIRED[key];
  return null;
}

// The display_name a people write must carry when it names a name part: the
// template over the stored parts with the patch on top. The S.23 trigger keeps
// a display_name that was set by hand, so an edit from the drawer would never
// reach such a row's shown name unless the write sets it itself (S.23.5). Null
// when the patch names no part or the parts cannot make a name yet.
export function shownNameAfter(stored: NameParts | null, patch: Record<string, unknown>): string | null {
  if (!("first_name" in patch || "last_name" in patch || "preferred_name" in patch)) return null;
  const merged = { ...stored, ...patch } as NameParts;
  return shownNameFromParts(merged.first_name, merged.last_name, merged.preferred_name);
}

export type GoesByFix = {
  label: string;
  patch: { first_name?: string; last_name?: string; preferred_name: string };
};
export type GoesByProblem = { message: string; fix: GoesByFix | null };

const BRACKETED = /^(.*\S)\s*\(([^()\s]+)\)$/;

const same = (a: string, b: string) => foldDiacritics(a.trim()) === foldDiacritics(b.trim());

function listed(parts: string[]): string {
  return parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// Null when the value is fine (one word, or blank). Otherwise the message to
// show and, when the value can be read, the patch that does what was meant. A
// typed part that matches the stored one without its accents keeps the stored
// spelling, so "Vo" over "Võ" changes nothing.
export function goesByProblem(value: string, parts: { given: string; family: string }): GoesByProblem | null {
  const v = value.trim();
  if (!/\s/.test(v)) return null;

  const bracketed = BRACKETED.exec(v);
  const words = bracketed ? bracketed[1].trim().split(/\s+/) : [];
  if (bracketed && words.length >= 2) {
    const nickname = bracketed[2];
    const given = words.slice(0, -1).join(" ");
    const family = words[words.length - 1];
    const patch: GoesByFix["patch"] = { preferred_name: nickname };
    const named: string[] = [];
    if (!same(given, parts.given)) {
      patch.first_name = given;
      named.push(`${given} as given name`);
    }
    if (!same(family, parts.family)) {
      patch.last_name = family;
      named.push(`${family} as family name`);
    }
    named.push(`${nickname} as goes by`);
    return {
      message: `“${v}” is a full name. Goes by holds one word: the name people call them.`,
      fix: { label: `Use ${listed(named)}`, patch },
    };
  }

  if (same(v, parts.given)) {
    return {
      message: `“${v}” is the given name again. Goes by holds a nickname, or stays blank.`,
      fix: { label: "Leave goes by blank", patch: { preferred_name: "" } },
    };
  }

  if (same(v, `${parts.given} ${parts.family}`) || same(v, `${parts.family} ${parts.given}`)) {
    return {
      message: `“${v}” is the given and family name again. Goes by holds one word, or stays blank.`,
      fix: { label: "Leave goes by blank", patch: { preferred_name: "" } },
    };
  }

  const plain = v.split(/\s+/);
  if (plain.length === 2 && same(plain[1], parts.family) && !same(plain[0], parts.given)) {
    return {
      message: `“${v}” is a nickname and the family name. Goes by holds the nickname alone.`,
      fix: { label: `Use ${plain[0]} as goes by`, patch: { preferred_name: plain[0] } },
    };
  }

  return { message: GOES_BY_ONE_WORD, fix: null };
}
