import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Card } from "./board-view-types";
import { buildCalendar } from "./workboard-calendar";
import { WorkboardCalendarMonth } from "./WorkboardCalendarMonth";

// W.175. The month Khoa chose over removing it: the cards on their days, at
// most three to a day, and the pane beside it as the full list. Invented
// names: the public fork receives test files too.

const TODAY = "2026-10-07"; // a Wednesday

const card = (id: string, due: string, over: Partial<Card> = {}): Card =>
  ({ id, title: `Card ${id}`, status: "open", due_date: due, board_id: "b1", epic_id: null, ...over }) as unknown as Card;

const html = (cards: Card[], selectedIso: string | null = null) => {
  const cal = buildCalendar({ cards, todayIso: TODAY });
  return renderToStaticMarkup(
    <WorkboardCalendarMonth
      period={cal.period}
      cells={cal.cells}
      selectedIso={selectedIso}
      boardById={new Map([["b1", { id: "b1", name: "Ops", client_color: 2 } as never]])}
      epicById={new Map()}
      showBoard
      onSelect={() => {}}
    />,
  );
};

/** The markup of one day's button, found by its accessible name's date. */
const day = (out: string, label: string) => {
  const at = out.lastIndexOf("<button", out.indexOf(`aria-label="${label}`));
  return out.slice(at, out.indexOf("</button>", at));
};

describe("WorkboardCalendarMonth", () => {
  it("puts each card on its day with the card's own edge", () => {
    const out = day(html([card("a", "2026-10-13")]), "13 Oct");
    expect(out).toContain("Card a");
    expect(out).toContain('class="admin-kanban-card-edge" data-client-color="2"');
    expect(out).toContain("1 due");
  });

  it("shows three cards, and a fuller day two and how many more in words, never a toggle", () => {
    const three = day(html(["a", "b", "c"].map((id) => card(id, "2026-10-13"))), "13 Oct");
    expect(three.match(/wb-cal-chip/g)).toHaveLength(3);
    expect(three).not.toContain("more");
    const five = day(html(["a", "b", "c", "d", "e"].map((id) => card(id, "2026-10-13"))), "13 Oct");
    expect(five.match(/wb-cal-chip/g)).toHaveLength(2);
    expect(five).toContain("+3 more");
    expect(five).not.toContain("aria-expanded");
  });

  it("says a past day with open work is late, in words and in the error ink", () => {
    const out = day(html([card("x", "2026-10-06")]), "6 Oct");
    expect(out).toContain("1 late");
    expect(out).toContain("wb-cal-chip is-late");
  });

  it("names an empty day as having nothing due, so a screen reader hears it", () => {
    expect(html([])).toContain('aria-label="20 Oct, nothing due"');
  });

  it("fills today and outlines the picked day", () => {
    const out = html([], "2026-10-15");
    expect(day(out, "7 Oct")).toContain("is-today");
    expect(day(out, "15 Oct")).toContain("is-selected");
    expect(day(out, "15 Oct")).toContain('aria-pressed="true"');
  });

  it("numbers each row by the ISO week the sprints are named by", () => {
    expect(html([])).toContain(">W41<");
  });
});
