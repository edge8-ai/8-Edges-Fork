import type { Band, ItemRule, ItemTest, Move, Profile } from "./profile";

// The replenishment engine (spec 2026-10-28, "The engine: one pure module"):
// a profile and the rows of one stock export in, the operator's jobs out. It
// reads no database, clock or file and imports nothing but the profile's
// types, so it is tested without mocks and a port can copy it as it is.

export type Cell = string | number | boolean | null | undefined;

export type Job = {
  item: string;
  description: string;
  rule: string;
  band: string;
  /** Totals and quantities are text, formatted as the operator reads them. */
  pick: string;
  reserve: string;
  move: string;
  collect: { location: string; qty: string }[];
  destinations: string[];
};

/** An item held in reserve that the profile could not read, and why: never silently dropped. */
export type LeftOut = { item: string; description: string; reason: string };

export type Run = {
  /** Data rows with any non-blank cell, before filtering. */
  dataRows: number;
  /** True when the export is small enough to have been cut off by the system that wrote it. */
  truncated: boolean;
  /** In walking order; the operator's job number is the position. */
  jobs: Job[];
  leftOut: LeftOut[];
};

type Placed = { item: string; location: string; role: "pick" | "reserve"; walk: number[]; qty: number };

const text = (cell: Cell): string => (cell === null || cell === undefined ? "" : String(cell));

/** Blank and non-numeric quantities are zero, so they never count. */
function quantity(cell: Cell): number {
  if (typeof cell === "number") return cell;
  const s = text(cell).trim();
  const n = Number(s);
  return s === "" || Number.isNaN(n) ? 0 : n;
}

function place(profile: Profile, location: string): { role: "pick" | "reserve"; walk: number[] } | null {
  for (const zone of profile.zones) {
    const match = new RegExp(zone.pattern).exec(location);
    if (match) return { role: zone.role, walk: [zone.rank, ...zone.walk.map((group) => walkStep(match.groups?.[group]))] };
  }
  return null;
}

/**
 * A walk group that is optional in the pattern and did not match, or matched
 * something that is not a number, walks first in its position. Read as NaN
 * instead, it would make every comparison false and leave the collection
 * order to the export's row order.
 */
function walkStep(group: string | undefined): number {
  const n = Number(group);
  return group === undefined || group === "" || Number.isNaN(n) ? -Infinity : n;
}

/** Compared, not subtracted: -Infinity minus -Infinity is NaN, not 0. */
function compareWalk(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? -Infinity;
    const y = b[i] ?? -Infinity;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Quantities are summed in binary floating point, where 1.1 + 2.2 is
 * 3.3000000000000003. Every sum is rounded to six places, finer than any
 * stock count, so totals compare and print as the operator would add them.
 */
const add = (a: number, b: number): number => Math.round((a + b) * 1e6) / 1e6;

const shown = (n: number) => String(n);

/**
 * Never more than reserve holds. A choice caps every option at reserve and
 * drops the duplicates that capping makes, so reserve 10 reads "8 or 10" and
 * reserve 5 reads "5".
 */
function moveText(move: Move, reserve: number): string {
  if (move.kind === "fixed") return shown(Math.min(move.qty, reserve));
  const capped = [...new Set(move.options.map((option) => Math.min(option, reserve)))].sort((a, b) => a - b);
  return capped.map(shown).join(" or ");
}

/** Text tests ignore case; a test may name both a substring and a pattern, and then both must hold. */
function passes(test: ItemTest, item: string, description: string): boolean {
  const value = test.field === "item" ? item : description;
  if (test.contains !== undefined && !value.toLowerCase().includes(test.contains.toLowerCase())) return false;
  if (test.regex !== undefined && !new RegExp(test.regex, "i").test(value)) return false;
  return true;
}

type Decided = { rule: ItemRule; band: Band } | { reason: string };

/**
 * Which rule and band an item falls in, or why it is left out. An item the
 * profile cannot read is never guessed: it is left out with the reason.
 */
function decide(profile: Profile, item: string, description: string): Decided {
  const exclusion = profile.exclude.find((t) => passes(t, item, description));
  if (exclusion) return { reason: exclusion.label };
  const rule = profile.rules.find((r) => r.enabled && r.when.every((t) => passes(t, item, description)));
  if (!rule) return { reason: "No rule applies" };
  for (const t of rule.require ?? []) if (!passes(t, item, description)) return { reason: `${rule.label}: no ${t.label}` };
  let size: number | null = null;
  if (rule.size) {
    const found = new RegExp(rule.size, "i").exec(description.trim())?.groups?.size;
    if (found === undefined) return { reason: `${rule.label}: size not readable` };
    size = Number(found);
  }
  const band = rule.bands.find((b) => size === null || ((b.min ?? -Infinity) <= size && size <= (b.max ?? Infinity)));
  if (!band) return { reason: `${rule.label}: size ${size} is outside every band` };
  return { rule, band };
}

/** The first row is the header. Columns are found by their heading, never by position. */
export function buildRun(profile: Profile, table: Cell[][]): Run {
  const header = (table[0] ?? []).map((h) => text(h).trim());
  const find = (heading: string): number => {
    const i = header.indexOf(heading.trim());
    if (i < 0) throw new Error(`The export has no "${heading}" column.`);
    return i;
  };
  const col = {
    item: find(profile.columns.item),
    description: find(profile.columns.description),
    location: find(profile.columns.location),
    qty: find(profile.columns.qty),
  };

  // Counted before any row is filtered: the truncation flag is about the
  // export's size, not about how much of it was in scope.
  const body = table.slice(1).filter((row) => row.some((cell) => text(cell).trim() !== ""));
  const dataRows = body.length;
  const truncated = profile.truncatedAtOrBelow !== null && dataRows <= profile.truncatedAtOrBelow;

  // One entry per item and BIN, quantities summed; an item's description is
  // the first non-blank one among the rows that count.
  const placed = new Map<string, Placed>();
  const descriptions = new Map<string, string>();
  for (const row of body) {
    const location = text(row[col.location]).trim();
    if (location === "") continue;
    const where = place(profile, location);
    if (!where) continue;
    const qty = quantity(row[col.qty]);
    if (!(qty > 0)) continue;
    const item = text(row[col.item]);
    const description = text(row[col.description]);
    if (!descriptions.has(item) && description !== "") descriptions.set(item, description);
    const key = `${item}\u0000${location}`;
    const prior = placed.get(key);
    if (prior) prior.qty = add(prior.qty, qty);
    else placed.set(key, { item, location, ...where, qty });
  }

  const byItem = new Map<string, Placed[]>();
  for (const p of placed.values()) byItem.set(p.item, [...(byItem.get(p.item) ?? []), p]);

  const jobs: (Job & { firstWalk: number[] })[] = [];
  const leftOut: LeftOut[] = [];
  for (const [item, rows] of byItem) {
    const description = descriptions.get(item) ?? "";
    const pick = rows.filter((r) => r.role === "pick").sort((a, b) => compareWalk(a.walk, b.walk));
    const reserve = rows.filter((r) => r.role === "reserve").sort((a, b) => compareWalk(a.walk, b.walk));
    const pickTotal = pick.reduce((s, r) => add(s, r.qty), 0);
    const reserveTotal = reserve.reduce((s, r) => add(s, r.qty), 0);
    const decided = decide(profile, item, description);
    if ("reason" in decided) {
      // Only an item with stock to move could have been a job; listing every
      // unreadable pick-only item would bury the ones that matter.
      if (reserveTotal > 0) leftOut.push({ item, description, reason: decided.reason });
      continue;
    }
    const { rule, band } = decided;
    if (!(reserveTotal > 0 && pickTotal < band.reorderBelow)) continue;
    jobs.push({
      item,
      description,
      rule: rule.label,
      band: band.label,
      pick: shown(pickTotal),
      reserve: shown(reserveTotal),
      move: moveText(band.move, reserveTotal),
      collect: reserve.map((r) => ({ location: r.location, qty: shown(r.qty) })),
      destinations: (profile.destinations.from === "furthest" ? [...pick].reverse() : pick)
        .slice(0, profile.destinations.count)
        .map((r) => r.location),
      firstWalk: reserve[0].walk,
    });
  }
  // Plain code-unit comparison, not locale: the order must not change with
  // the server's language settings.
  jobs.sort((a, b) => compareWalk(a.firstWalk, b.firstWalk) || (a.item < b.item ? -1 : a.item > b.item ? 1 : 0));
  return { dataRows, truncated, jobs: jobs.map(({ firstWalk: _firstWalk, ...job }) => job), leftOut };
}
