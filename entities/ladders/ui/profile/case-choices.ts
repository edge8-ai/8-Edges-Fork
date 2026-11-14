// The choices Customise offers from the badges the reader found (LD.6; spec
// "The profile page"; the badges doc's rule 5): a Title is a found badge's
// family name, worn without its tier numeral, and the display case holds up to
// five found badges, in order. Pure and browser-safe: the found badges arrive
// from the server already named, so the hero never loads the catalogue. Only
// a badge in `found` is ever offered, and setDisplay refuses any other.
import { DISPLAY_CASE_HOLDS } from "../../lib/display-choices";

/** A badge the reader found, as Customise names it: its id, its name, and its family (the Title it gives). */
export type FoundBadge = { id: string; name: string; family: string };

export type TitleOption = { value: string; label: string };

/** One Title per family the reader found, in the order found; the value is the first found badge of that family. */
export function titleOptions(found: readonly FoundBadge[]): TitleOption[] {
  const seen = new Set<string>();
  const out: TitleOption[] = [];
  for (const badge of found) {
    if (seen.has(badge.family)) continue;
    seen.add(badge.family);
    out.push({ value: badge.id, label: badge.family });
  }
  return out;
}

/** The Title a worn badge gives, or null; a badge outside `found` gives none. */
export function titleFor(found: readonly FoundBadge[], titleBadge: string | null): string | null {
  if (!titleBadge) return null;
  return found.find((b) => b.id === titleBadge)?.family ?? null;
}

/** The option the Title select shows for the badge worn: the one of the same family, or "" for No title. */
export function titleValue(found: readonly FoundBadge[], titleBadge: string | null): string {
  const family = titleFor(found, titleBadge);
  return family ? (titleOptions(found).find((o) => o.label === family)?.value ?? "") : "";
}

/** The select's value as setDisplay takes it: "" is No title. */
export const titleChoice = (value: string): string | null => (value === "" ? null : value);

/** The found badges an empty slot's Add… offers: every one not already in the case. */
export function addable(found: readonly FoundBadge[], caseIds: readonly string[]): FoundBadge[] {
  return found.filter((b) => !caseIds.includes(b.id));
}

/** The case with a found badge added at the end; a full case, or one already holding it, is unchanged. */
export function withAdded(caseIds: readonly string[], id: string): string[] {
  if (caseIds.includes(id) || caseIds.length >= DISPLAY_CASE_HOLDS) return [...caseIds];
  return [...caseIds, id];
}

/** The case without one badge; the ones after it move up a slot. */
export function withRemoved(caseIds: readonly string[], id: string): string[] {
  return caseIds.filter((x) => x !== id);
}
