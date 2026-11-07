import { describe, expect, it } from "vitest";
import { adminNav } from "./nav";
import { VIEWS, readFilters, searchParamsObj, type ViewId } from "./workboard-filter-params";

// W.103.10. The sidebar's Board / List / Calendar rows are links to ONE route
// with a different `?view=`, and the page they land on decides what to draw by
// reading that param back through `readFilters`. Two halves of one contract
// written in two files, with nothing between them that the type checker can
// see: a row could name a view the codec does not know, or the codec could
// rename one, and the only symptom would be a row that lights up over a page
// that did not change.
//
// WHAT THIS DOES NOT COVER, said plainly: the bug that prompted it was in
// neither half. Both were right; the component simply never re-read the URL on
// a navigation that was not Back or Forward, because `useState` reads it once
// and only `popstate` re-read it. That is an effect on a mounted component,
// and this repo's suite runs in node with no DOM and no hook renderer, so
// testing it would mean adding jsdom and a renderer for one assertion. It was
// verified in a browser instead: pushState to ?view=list / ?view=calendar /
// no query, with no popstate, each followed by the view actually changing and
// the toolbar agreeing. This test guards the half that CAN go wrong silently
// from here on.

const VOCAB = {
  clients: [], boards: [], people: [], lanes: [], sprints: [], weeks: [], epics: [],
  single: null, activeSprints: [], views: [...VIEWS] as ViewId[], groupings: [],
} as unknown as Parameters<typeof readFilters>[1];

/** The `?view=` a sidebar row asks for, or null when it names no query. */
function viewParamOf(href: string): string | null {
  const q = href.indexOf("?");
  if (q === -1) return null;
  return new URLSearchParams(href.slice(q + 1)).get("view");
}

const workboardRows = adminNav
  .flatMap((s) => s.items)
  .filter((i) => i.href.startsWith("/admin/edges/workboard") && !i.href.includes("/flow"));

describe("the sidebar's workboard rows and the page's URL codec agree", () => {
  it("has a row for every view the board offers, and no row for one it does not", () => {
    const named = workboardRows.map((r) => viewParamOf(r.href) ?? "board");
    expect(new Set(named)).toEqual(new Set(VIEWS));
  });

  it("names a view the codec reads back as that same view", () => {
    for (const row of workboardRows) {
      const view = viewParamOf(row.href);
      const read = readFilters(searchParamsObj(view ? `?view=${view}` : ""), VOCAB);
      expect({ row: row.label, view: read.view }).toEqual({ row: row.label, view: view ?? "board" });
    }
  });

  it("leaves Board's row without a query, because the default view writes none", () => {
    // The codec omits a param at its default, so the Board row is current
    // exactly when the address bar is silent — `makeIsActive` depends on it,
    // and a row that carried `?view=board` would never match.
    const board = workboardRows.find((r) => r.label === "Board");
    expect(board?.href).toBe("/admin/edges/workboard");
  });
});
