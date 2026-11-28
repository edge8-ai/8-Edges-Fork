import { describe, expect, it } from "vitest";
import { myWeekFocus } from "./my-week-focus";
import type { MyWeekModel, MyWeekRow } from "./my-week";

const row = (id: string, over: Partial<MyWeekRow> = {}): MyWeekRow => ({
  id,
  title: id,
  priority: "p2",
  href: null,
  place: "Edge8 · 8 Edges",
  due: null,
  lateDays: 0,
  carried: false,
  carriedFrom: null,
  doing: false,
  fresh: false,
  waitingOn: null,
  ht: null,
  spark: null,
  ...over,
});

// Wednesday 14 Oct, in the sprint that runs Wed 14 to Tue 20.
const model = (over: Partial<MyWeekModel>): MyWeekModel =>
  ({
    today: "2026-10-14",
    window: { startsOn: "2026-10-14", endsOn: "2026-10-20" },
    doing: [],
    now: [],
    fresh: [],
    days: [
      { date: "2026-10-14", isToday: true, isPast: false, open: [] },
      { date: "2026-10-15", isToday: false, isPast: false, open: [] },
      { date: "2026-10-16", isToday: false, isPast: false, open: [] },
    ],
    later: [],
    undated: [],
    ...over,
  }) as MyWeekModel;

describe("myWeekFocus", () => {
  it("puts every late card in Overdue, started or not, the latest first", () => {
    const f = myWeekFocus(
      model({
        doing: [row("started-late", { doing: true, due: "2026-09-29", lateDays: 15 })],
        now: [row("late", { due: "2026-10-10", lateDays: 4 }), row("today", { due: "2026-10-14" })],
      }),
    );
    expect(f.overdue.map((r) => r.id)).toEqual(["started-late", "late"]);
    expect(f.due[0]).toMatchObject({ date: "2026-10-14", isToday: true });
    expect(f.due[0].rows.map((r) => r.id)).toEqual(["today"]);
  });

  it("lists started work that falls due this sprint on its day, and folds started work with no near date", () => {
    const f = myWeekFocus(
      model({
        doing: [
          row("doing-fri", { doing: true, due: "2026-10-16" }),
          row("doing-after", { doing: true, due: "2026-10-23" }),
          row("doing-undated", { doing: true }),
        ],
        days: [
          { date: "2026-10-14", isToday: true, isPast: false, open: [] },
          { date: "2026-10-15", isToday: false, isPast: false, open: [row("thu")] },
          { date: "2026-10-16", isToday: false, isPast: false, open: [row("fri")] },
        ],
      }),
    );
    expect(f.due.map((d) => [d.date, d.rows.map((r) => r.id)])).toEqual([
      ["2026-10-15", ["thu"]],
      ["2026-10-16", ["doing-fri", "fri"]],
    ]);
    expect(f.rest.doing.map((r) => r.id)).toEqual(["doing-after", "doing-undated"]);
  });

  it("folds new work, work due after the sprint and undated work, and counts every card once", () => {
    const f = myWeekFocus(
      model({
        now: [row("late", { lateDays: 2, due: "2026-10-12" })],
        fresh: [row("new", { fresh: true })],
        later: [row("after", { due: "2026-10-30" })],
        undated: [row("someday")],
      }),
    );
    expect(f.counts).toEqual({ overdue: 1, due: 0, rest: 3 });
    expect(f.due).toEqual([]);
  });
});
