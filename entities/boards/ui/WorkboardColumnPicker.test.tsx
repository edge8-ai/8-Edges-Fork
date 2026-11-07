import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkboardColumnPicker } from "./WorkboardColumnPicker";

// W.64. The picker exists so a phone shows one column at a time; every
// column stays in the board's markup at every width, and the CSS that hides
// the others lives inside the tablet media query.
const columns = [
  { id: "To do", label: "To do" },
  { id: "Doing", label: "Doing" },
  { id: "Done", label: "Done" },
];
const html = (activeId: string, cols = columns) =>
  renderToStaticMarkup(<WorkboardColumnPicker columns={cols} activeId={activeId} countFor={(id) => id.length} onSelect={() => {}} />);

describe("WorkboardColumnPicker", () => {
  it("offers every column as a tab", () => {
    const out = html("To do");
    for (const c of columns) expect(out).toContain(c.label);
  });

  it("marks exactly one tab selected", () => {
    const out = html("Doing");
    expect(out.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(out.match(/aria-selected="false"/g)).toHaveLength(2);
  });

  it("draws nothing when there is only one column to pick", () => {
    // A picker with one tab is a label, and the board already has one.
    expect(html("To do", [columns[0]])).toBe("");
  });

  it("shows the board's own counts, so the tab and the header agree", () => {
    // countFor is passed in from WorkboardKanban, which holds the count
    // still while a move is being written (W.49); the picker never counts
    // for itself.
    expect(html("To do")).toContain(">5<");
  });
});
