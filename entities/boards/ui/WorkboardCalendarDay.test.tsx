import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Card } from "./board-view-types";
import type { CalendarGroup } from "./workboard-calendar";
import { WorkboardCalendarDay } from "./WorkboardCalendarDay";

// W.109. The day head says what the day holds, and a row is the quiet card on
// one line — the same edge, the same lane badge, the same soft avatar the
// board's card carries (W.107), so a reader moving between the two views does
// not have to relearn either.
//
// Fixture names are invented: a real colleague's name in a test fixture fails
// check:fork-safe, because the public fork receives the test files too.

const card = (over: Partial<Card> = {}): Card =>
  ({
    id: "c1",
    title: "Reconcile the September invoices",
    status: "open",
    due_date: "2026-09-22",
    board_id: "b1",
    epic_id: null,
    laneId: "Doing",
    columnId: "Doing",
    assignee_name: "Marisol Enwright",
    human_tokens: 0.3,
    ...over,
  }) as unknown as Card;

const group = (over: Partial<CalendarGroup<Card>> = {}): CalendarGroup<Card> => ({
  key: "2026-09-22",
  kind: "day",
  iso: "2026-09-22",
  cards: [card()],
  open: 3,
  done: 1,
  overdue: 2,
  today: true,
  past: false,
  ...over,
});

const html = (g: CalendarGroup<Card> = group(), selected = false) =>
  renderToStaticMarkup(
    <WorkboardCalendarDay
      group={g}
      boardById={new Map([["b1", { id: "b1", name: "Ops", client_name: "Northwind Foods", client_color: 2 } as never]])}
      epicById={new Map()}
      laneById={new Map([["Doing", { id: "Doing", label: "Doing", accent: "var(--admin-chart-1)" }]])}
      showBoard
      selected={selected}
      onCardClick={() => {}}
    />,
  );

describe("WorkboardCalendarDay", () => {
  it("names today and the weekday", () => {
    const out = html();
    expect(out).toContain("Today · 22 Sep");
    expect(out).toContain("Tuesday");
  });

  // W.175: the rows are the count, and the month grid prints one per day.
  it("prints no count in the head", () => {
    const out = html(group({ open: 3, done: 1, overdue: 2 }));
    expect(out).not.toContain("3 open");
    expect(out).not.toContain("1 done");
    expect(out).not.toContain("2 overdue");
  });

  it("heads a day that is not today with the bare date", () => {
    const out = html(group({ today: false }));
    expect(out).toContain("22 Sep");
    expect(out).not.toContain("Today ·");
  });

  it("marks the day picked on the grid, and carries its key for the scroll", () => {
    expect(html(group(), true)).toContain("is-selected");
    expect(html(group(), false)).not.toContain("is-selected");
    expect(html()).toContain('data-group="2026-09-22"');
  });

  it("gathers the overdue cards under one head with no weekday", () => {
    const out = html(group({ key: "overdue", kind: "overdue", iso: null, today: false, past: true }));
    expect(out).toContain("Overdue");
    expect(out).not.toContain("Tuesday");
  });

  it("draws the row as the quiet card: edge, title, client, HT, avatar, lane badge", () => {
    const out = html();
    // The board's own edge rule (W.41): many boards in scope, so the edge is
    // the client's colour and not the epic's.
    expect(out).toContain('class="admin-kanban-card-edge" data-client-color="2"');
    expect(out).toContain("Reconcile the September invoices");
    expect(out).toContain("Northwind Foods");
    expect(out).toContain("0.3 HT");
    expect(out).toContain("admin-avatar admin-avatar--sm admin-avatar--soft");
    // The lane's badge, taking its colour through the same custom property
    // kernel/ui/KanbanBoard hands a column (W.107).
    expect(out).toContain('class="wb-col-badge"');
    expect(out).toContain("--kanban-accent:var(--admin-chart-1)");
  });

  it("strikes a finished card and never colours one by priority (W.48)", () => {
    const out = html(group({ cards: [card({ status: "done" })] }));
    expect(out).toContain("wb-cal-row is-done");
    expect(out).not.toContain("p1");
  });
});
