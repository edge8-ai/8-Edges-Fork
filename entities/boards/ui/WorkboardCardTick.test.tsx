import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkboardCardTick } from "./WorkboardCardTick";
import type { BoardSelection } from "./useBoardSelection";

// W.93. The tick box is not visible at rest, and the CSS is what makes it
// appear. This test holds the CLASSES the CSS hangs off, because that contract
// is the whole fix: `.wb-card-tick` is hidden, `.is-shown` overrides it, and
// the hover/focus rules key off the card element around it (admin.css).

const selection = (over: Partial<BoardSelection> = {}): BoardSelection => ({
  selected: new Set<string>(),
  ids: [],
  toggle: () => {},
  clear: () => {},
  picking: false,
  startPicking: () => {},
  togglePicking: () => {},
  ...over,
});

const html = (s: BoardSelection) => renderToStaticMarkup(<WorkboardCardTick cardId="c1" title="Fix the thing" selection={s} />);

describe("WorkboardCardTick", () => {
  it("is in the markup but not shown when nothing is picked", () => {
    const out = html(selection());
    expect(out).toContain("wb-card-tick");
    expect(out).not.toContain("is-shown");
  });

  it("shows on every card once picking is on", () => {
    expect(html(selection({ picking: true }))).toContain("wb-card-tick is-shown");
  });

  it("is never pre-checked: the checked state comes only from the selection", () => {
    expect(html(selection({ picking: true }))).not.toContain("checked");
    expect(html(selection({ selected: new Set(["c1"]), picking: true }))).toContain("checked");
    expect(html(selection({ selected: new Set(["other"]), picking: true }))).not.toContain("checked");
  });

  it("keeps the label that says which card it selects", () => {
    expect(html(selection())).toContain('aria-label="Select Fix the thing"');
  });

  it("keeps the planning page's head class, so the box sits where it always did", () => {
    expect(html(selection())).toContain("admin-kanban-card-head");
  });
});
