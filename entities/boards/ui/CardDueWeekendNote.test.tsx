import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CardDueWeekendNote } from "./CardDueWeekendNote";

// W.68. 2026-09-19 is a Saturday, 2026-09-20 the Sunday after it, 2026-09-18
// the Friday before and 2026-09-21 the Monday after.
const html = (value: string) => renderToStaticMarkup(<CardDueWeekendNote value={value} onChange={() => {}} />);

describe("CardDueWeekendNote", () => {
  it("says nothing about a weekday", () => {
    expect(html("2026-09-18")).not.toContain("weekend");
  });

  it("warns on a Saturday and offers both working days around it", () => {
    const out = html("2026-09-19");
    expect(out).toContain("is a weekend");
    expect(out).toContain(">Fri 18 Sep</button>");
    expect(out).toContain(">Mon 21 Sep</button>");
  });

  // Bug hunt U5: the note used to say "Oct 10, 2026" and "Friday Oct 9, 2026"
  // under a chip that says "Sat 10 Oct". One way of writing a date per drawer.
  it("writes its dates the way the drawer's chips do", () => {
    const out = html("2026-10-10");
    expect(out).toContain("Sat 10 Oct is a weekend");
    expect(out).toContain(">Fri 9 Oct</button>");
    expect(out).toContain(">Mon 12 Oct</button>");
    expect(out).not.toContain("2026");
  });

  it("warns on a Sunday too", () => {
    expect(html("2026-09-20")).toContain("is a weekend");
  });

  // A.29.1. Overdue is the day after the due date in calendar days, so the
  // note names that day: Sunday for a Saturday, Monday for a Sunday.
  it("names the day the card turns overdue, which is the next day", () => {
    expect(html("2026-09-19")).toContain("overdue from Sunday");
    expect(html("2026-09-20")).toContain("overdue from Monday");
  });

  it("STILL HOLDS the Saturday — the warning is not a rewrite", () => {
    // The note names the date the person picked and offers two alternatives.
    // Nothing here changes the form; a person has to press one of the buttons.
    expect(html("2026-09-19")).toContain("Sat 19 Sep is a weekend");
  });

  it("is not an alert: nothing has gone wrong", () => {
    expect(html("2026-09-19")).not.toContain('role="alert"');
  });

  it("says nothing when there is no date at all", () => {
    expect(html("")).toBe("");
  });
});
