import type { ItemTest, Move, Profile, ProfileIssue } from "../lib/profile";

// The profile editor's draft (RP.6): how a typed value becomes part of the
// draft, the blank parts the "Add" buttons insert, and how a refusal's field
// path is put back beside its field and named in words. Pure, so the editor's
// behaviour is tested without rendering it.
//
// A draft is a Profile that may not pass the schema yet. A required number
// left blank or mistyped is NaN, which the schema refuses at that field
// ("Enter a number"); an optional one left blank is absent.

type Zone = Profile["zones"][number];
type Rule = Profile["rules"][number];
type Band = Rule["bands"][number];

/** A required number from its input: blank or mistyped is NaN, which the schema refuses at that field. */
export const requiredNumber = (text: string): number => (text.trim() === "" ? Number.NaN : Number(text));

/** An optional number from its input: blank is absent. */
export const optionalNumber = (text: string): number | undefined => (text.trim() === "" ? undefined : Number(text));

/** A number as its input shows it: NaN and absent are blank. */
export const numberText = (value: number | null | undefined): string =>
  value === null || value === undefined || Number.isNaN(value) ? "" : String(value);

/** The options of a choice from "8, 12" or "8 12". A mistyped option stays as NaN so the schema names it. */
export const optionsFrom = (text: string): number[] =>
  text
    .split(/[,\s]+/)
    .filter((part) => part !== "")
    .map(Number);

/** A list typed as "aisle, bay": blank entries dropped. */
export const listFrom = (text: string): string[] =>
  text
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");

/** Lines typed one per line: blank lines dropped, because the schema refuses an empty instruction. */
export const linesFrom = (text: string): string[] =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

/** Blank text is absent, for the optional fields. */
export const optionalText = (text: string): string | undefined => (text === "" ? undefined : text);

export const replaceAt = <T>(list: readonly T[], i: number, value: T): T[] => list.map((item, j) => (j === i ? value : item));
export const removeAt = <T>(list: readonly T[], i: number): T[] => list.filter((_, j) => j !== i);

/** The list with item `i` moved one place up (-1) or down (+1); unchanged at either end. */
export function moveAt<T>(list: readonly T[], i: number, by: -1 | 1): T[] {
  const j = i + by;
  if (j < 0 || j >= list.length) return [...list];
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** An id no other entry uses: zones and rules are told apart by id, never by position. */
function freshId(prefix: string, taken: readonly { id: string }[]): string {
  const used = new Set(taken.map((t) => t.id));
  let n = taken.length + 1;
  while (used.has(`${prefix}-${n}`)) n += 1;
  return `${prefix}-${n}`;
}

export const blankTest = (): ItemTest => ({ label: "" });

export const blankBand = (): Band => ({ label: "", reorderBelow: Number.NaN, move: { kind: "fixed", qty: Number.NaN } });

/** A new zone walks after every zone of its role. */
export const blankZone = (zones: readonly Zone[]): Zone => ({
  id: freshId("zone", zones),
  label: "",
  role: "reserve",
  pattern: "",
  walk: [],
  rank: zones.filter((zone) => zone.role === "reserve").reduce((top, zone) => Math.max(top, zone.rank + 1), 0),
});

/** A new rule starts turned off, so it can be drafted before it decides any item (story 21). */
export const blankRule = (rules: readonly Rule[]): Rule => ({
  id: freshId("rule", rules),
  label: "",
  enabled: false,
  when: [blankTest()],
  bands: [blankBand()],
});

/** A move switched to the other kind keeps what amounts it can. */
export function withMoveKind(move: Move, kind: Move["kind"]): Move {
  if (move.kind === kind) return move;
  return move.kind === "choice" ? { kind: "fixed", qty: move.options[0] ?? Number.NaN } : { kind: "choice", options: [move.qty] };
}

/** The messages of the issues at `path` or inside it, so the move cell also shows a bad option's. */
export function issuesAt(issues: readonly ProfileIssue[], path: string): string[] {
  return issues.filter((issue) => issue.path === path || issue.path.startsWith(`${path}.`)).map((issue) => plainMessage(issue.message));
}

/** Zod's wording, in the editor's. */
export function plainMessage(message: string): string {
  if (/at least 1 character/.test(message) || message === "Required") return "Required.";
  if (/received nan/i.test(message) || /Expected number/.test(message)) return "Enter a number.";
  if (/greater than 0/.test(message)) return "Enter a number above 0.";
  if (/at least 2 element/.test(message)) return "Give at least two amounts, such as 8, 12.";
  if (/at least 1 element/.test(message)) return "Add at least one.";
  return message.endsWith(".") ? message : `${message}.`;
}

const COLUMN_NAMES: Record<string, string> = { item: "Item code column", description: "Description column", location: "Location column", qty: "Quantity column" };
const BAND_PARTS: Record<string, string> = { label: "name", min: "smallest size", max: "largest size", reorderBelow: "restock threshold", move: "amount to move" };
const ZONE_PARTS: Record<string, string> = { label: "name", role: "holds", walk: "walk by", rank: "walking order" };
const TEST_PARTS: Record<string, string> = { label: "name", contains: "words", regex: "pattern" };
const WORD_NAMES: Record<string, string> = {
  pick: "Name for pick BINs",
  reserve: "Name for reserve BINs",
  instructions: "Instructions",
  destinationRule: "Where to put it",
  noPickNote: "When an item has no pick BIN",
  choiceHint: "When the operator chooses the amount",
  footer: "Footer line",
};

const named = (what: string, label: string | undefined, n: number) => (label ? `${what} “${label}”` : `${what} ${n + 1}`);

function testName(list: string, tests: readonly ItemTest[] | undefined, rest: string[]): string {
  const i = Number(rest[0]);
  const part = rest[1] ? `: ${TEST_PARTS[rest[1]] ?? rest[1]}` : "";
  return `${list}, ${named("test", tests?.[i]?.label, i)}${part}`;
}

/**
 * A refusal's field path in the words the editor's labels use, for the list
 * of problems above the form: "rules.0.bands.1.move" is `Rule “Kestrel”, band
 * “EU 43-44”: amount to move`. An unknown path is shown as it is.
 */
export function fieldName(path: string, draft: Profile): string {
  const [head, a, b, c, d] = path.split(".");
  const i = Number(a);
  if (head === "columns" && a) return COLUMN_NAMES[a] ?? path;
  if (head === "truncatedAtOrBelow") return "Cut-off warning";
  if (head === "zones") {
    if (a === undefined) return "Zones";
    return `${named("Zone", draft.zones[i]?.label, i)}${b ? `: ${ZONE_PARTS[b] ?? b}` : ""}`;
  }
  if (head === "exclude") return testName("Always leave out", draft.exclude, [a, b].filter(Boolean));
  if (head === "rules") {
    if (a === undefined) return "Item rules";
    const rule = draft.rules[i];
    const ruleName = named("Rule", rule?.label, i);
    if (b === "when") return `${ruleName}: ${testName("applies when", rule?.when, [c, d].filter(Boolean))}`;
    if (b === "require") return `${ruleName}: ${testName("must also carry", rule?.require, [c, d].filter(Boolean))}`;
    if (b === "size") return `${ruleName}: size pattern`;
    if (b === "bands" && c !== undefined) {
      const j = Number(c);
      return `${ruleName}, ${named("band", rule?.bands[j]?.label, j)}${d ? `: ${BAND_PARTS[d] ?? d}` : ""}`;
    }
    return b ? `${ruleName}: ${b === "label" ? "name" : b}` : ruleName;
  }
  if (head === "destinations") return a === "count" ? "How many BINs to suggest" : "Where the stock goes";
  if (head === "words" && a) return WORD_NAMES[a] ?? path;
  return path;
}

/** A value with its object keys sorted and its absent ones dropped, so two drafts compare as stored. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => [k, canonical(v)]),
  );
}

/**
 * Whether a draft holds what the saved profile holds. A field typed back to
 * what it was is not an unsaved change, and neither is the order the schema
 * hands keys back in after a save.
 */
export const sameProfile = (a: Profile, b: Profile): boolean => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
