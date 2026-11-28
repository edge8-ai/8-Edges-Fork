import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CardDrawerBar } from "./CardDrawerBar";
import type { Form } from "./board-view-types";

// W.207.5. When the deadline rule has moved a card's date, the due pill says
// when it was first due, as a quiet note beside the current date. A card whose
// date never moved shows nothing extra. A static render is the pill at rest.

const form = { id: "c1", laneId: "To do", assigneeId: null, dueDate: "2026-11-17", priority: "p2", humanTokens: "1.3" } as unknown as Form;

function bar(firstDueDate: string | null, readOnly = false) {
  return renderToStaticMarkup(
    <CardDrawerBar
      form={form}
      setForm={() => {}}
      lanes={[]}
      people={[]}
      currentAssigneeName={null}
      derivedTokens={null}
      readOnly={readOnly}
      onMoveLane={() => {}}
      firstDueDate={firstDueDate}
    />,
  );
}

describe("the drawer's due pill: first due", () => {
  it("reads 'Tue 17 Nov · first due 13 Nov' as a muted note, no weekday on the first date", () => {
    const out = bar("2026-11-13");
    expect(out).toContain("Tue 17 Nov");
    expect(out).toContain('<span class="wb-chip-muted wb-due-first"><span class="wb-due-first-sep"> · </span>first due 13 Nov</span>');
  });

  it("gives both dates in full to a screen reader", () => {
    expect(bar("2026-11-13")).toContain('aria-label="Due Tue 17 Nov, first due Fri 13 Nov. Change it"');
  });

  it("shows the note on a read-only drawer too", () => {
    expect(bar("2026-11-13", true)).toContain("first due 13 Nov");
  });

  it("shows nothing extra when the date never moved", () => {
    const out = bar(null);
    expect(out).not.toContain("first due");
    expect(out).not.toContain("wb-due-first");
    expect(out).toContain('aria-label="Due Tue 17 Nov. Change it"');
  });
});
