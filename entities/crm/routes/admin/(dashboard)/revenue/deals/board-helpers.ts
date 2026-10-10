// Pure helpers for the pipeline board and its list view: idle-day maths,
// the search predicate and the list sort. No React, no data.
import type { DealCard } from "./types";
import { HANDOFF_COLUMN_ID } from "./constants";

export function idleDays(updatedAt: string | null): number | null {
  if (!updatedAt) return null;
  const days = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000);
  return days >= 0 ? days : null;
}

// Client-side free-text filter for the board and list. `query` is already
// trimmed + lowercased. Matches title, contact, company, referrer and source.
export function cardMatches(c: DealCard, query: string): boolean {
  if (!query) return true;
  return [c.title, c.contactName, c.companyName, c.referrerName, c.referrerCompanyName, c.source].some((v) =>
    v ? v.toLowerCase().includes(query) : false,
  );
}

export type ListSort = { key: string; dir: "asc" | "desc" };

export function dealSortValue(c: DealCard, key: string, stageLabelMap: Map<string, string>): string | number | null {
  switch (key) {
    case "deal":
      return (c.title || c.contactName || c.companyName || "").toLowerCase();
    case "stage":
      return c.columnId === HANDOFF_COLUMN_ID ? "new from sdr" : (stageLabelMap.get(c.columnId) ?? "").toLowerCase();
    case "amount":
      return c.amountUsdCents;
    case "prob":
      return c.probability;
    case "nextstep":
      return c.nextStepDate;
    case "status":
      return c.status ?? "";
    default:
      return null;
  }
}

// Client-side sort for the list view. Empty/null values always sort last,
// regardless of direction, so a click never buries the populated rows.
export function makeDealComparator(sort: ListSort, stageLabelMap: Map<string, string>) {
  const mul = sort.dir === "desc" ? -1 : 1;
  return (a: DealCard, b: DealCard) => {
    const va = dealSortValue(a, sort.key, stageLabelMap);
    const vb = dealSortValue(b, sort.key, stageLabelMap);
    const aEmpty = va === null || va === undefined || va === "";
    const bEmpty = vb === null || vb === undefined || vb === "";
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    const d = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
    return d * mul;
  };
}
