import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Card } from "./board-view-types";
import { ListDue } from "./WorkboardListEdit";

// W.175. The List's Due cell says a date the way the card face does, so the
// three views never print the same date three ways.

const TODAY = "2026-10-07";
const card = (over: Partial<Card>): Card => ({ id: "c1", title: "A card", status: "open", due_date: null, completed_at: null, ...over }) as unknown as Card;
const cell = (c: Card, overdue = false) =>
  renderToStaticMarkup(
    <table>
      <tbody>
        <tr>
          <ListDue card={c} today={TODAY} overdue={overdue} canEdit={false} saving={false} onDue={() => {}} />
        </tr>
      </tbody>
    </table>,
  );

describe("ListDue", () => {
  it("reads a due date as the card face does, with no year", () => {
    const out = cell(card({ due_date: "2026-10-08" }));
    expect(out).toContain("Thu 8 Oct");
    expect(out).not.toContain("2026");
  });

  it("says Today in the accent for an open card due today", () => {
    const out = cell(card({ due_date: TODAY }));
    expect(out).toContain(">Today<");
    expect(out).toContain("wb-list-due-today");
  });

  it("says Overdue in words as well as the error ink", () => {
    const out = cell(card({ due_date: "2026-10-06" }), true);
    expect(out).toContain("Overdue · 6 Oct");
    expect(out).toContain('class="u-err"');
  });

  it("dates finished work by its completion, as the card does", () => {
    expect(cell(card({ status: "done", due_date: "2026-10-01", completed_at: "2026-10-07T03:00:00Z" }))).toContain("Done 7 Oct");
  });

  it("names the cell's button with the words it shows", () => {
    const edit = (c: Card, overdue = false) =>
      renderToStaticMarkup(
        <table>
          <tbody>
            <tr>
              <ListDue card={c} today={TODAY} overdue={overdue} canEdit saving={false} onDue={() => {}} />
            </tr>
          </tbody>
        </table>,
      );
    expect(edit(card({ due_date: TODAY }))).toContain('aria-label="Due today. Change the due date"');
    expect(edit(card({ due_date: "2026-10-08" }))).toContain('aria-label="Due Thu 8 Oct. Change the due date"');
    expect(edit(card({ due_date: "2026-10-06" }), true)).toContain('aria-label="Overdue · 6 Oct. Change the due date"');
    expect(edit(card({}))).toContain('aria-label="Set a due date"');
  });

  it("prints the en dash for a card with no date", () => {
    expect(cell(card({}))).toContain("wb-list-dash");
  });
});
