import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { KanbanBoard } from "@/kernel/ui/KanbanBoard";
import { CARD_NODE_ATTR } from "./focus-card";

// W.104.8. Two features on this board reach a card by CSS selector: the card
// drawer hands focus back to the card it opened from, and walking the board
// with j/k scrolls the selection into view. Both were written against
// `data-rbd-draggable-id`, the attribute react-beautiful-dnd writes. This repo
// uses @hello-pangea/dnd, the maintained fork, which renamed every data
// attribute to `rfd` — so both selectors matched nothing and both features
// were dead from the day they shipped.
//
// NOTHING CAUGHT IT, and that is the part worth a test. The type checker sees
// a string. Neither call site throws: `focusCard` returns false and the drawer
// falls through to the element that had focus before it opened, which IS the
// card whenever a mouse opened it; the scroll effect optional-chains a null.
// A selector matching nothing is indistinguishable from a card that is not on
// screen, and "not on screen" is a case both callers must handle anyway.
//
// So this test does the one thing that can fail: it renders a real board
// through the real drag library and asserts the attribute the module looks for
// is the attribute the markup carries. The library is deliberately NOT mocked
// — a mock would emit whatever this file told it to and prove nothing.

const board = (cardId: string) =>
  renderToStaticMarkup(
    <KanbanBoard<{ id: string; columnId: string; title: string }>
      columns={[{ id: "todo", label: "To do" }]}
      cards={[{ id: cardId, columnId: "todo", title: "Hold the selector honest" }]}
      onMove={() => {}}
      renderCard={(c) => <span>{c.title}</span>}
    />,
  );

describe("the board's card selector", () => {
  it("names the attribute the drag library actually renders", () => {
    expect(board("card-1")).toContain(`${CARD_NODE_ATTR}="card-1"`);
  });

  it("does not name the attribute of the library this repo does not use", () => {
    // The exact regression: `rbd` is react-beautiful-dnd's prefix, and nothing
    // in this tree renders it.
    expect(board("card-1")).not.toContain("data-rbd-draggable-id");
    expect(CARD_NODE_ATTR).not.toContain("rbd");
  });
});
