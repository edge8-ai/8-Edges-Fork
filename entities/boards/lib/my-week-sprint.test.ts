import { describe, expect, it } from "vitest";
import type { MyWeekCard } from "./my-week-read";
import type { MyWeekRow } from "./my-week";
import { sprintWeekOf } from "./my-week";
import { railReadSince, sprintRail } from "./my-week-sprint";

// W.173: the rail's rules. The ring counts each card once and knows the day;
// Next up is picked by a rule a person could predict; a badge is earned by
// this sprint's own work and nothing else; the garden reads past sprints by
// the business day a card was finished on, and an empty sprint is a seed (0),
// never missing.
const SPAN = { startsOn: "2026-10-07", endsOn: "2026-10-13" };
const FRIDAY = "2026-10-09";

const row = (over: Partial<MyWeekRow>): MyWeekRow => ({
  id: "r",
  title: "Row",
  priority: "p2",
  href: null,
  place: "",
  due: null,
  lateDays: 0,
  carried: false,
  carriedFrom: null,
  doing: false,
  fresh: false,
  waitingOn: null,
  ht: null,
  ...over,
});
let n = 0;
const done = (over: Partial<MyWeekCard>): MyWeekCard => ({
  id: `d${(n += 1)}`,
  title: `Done ${n}`,
  board_id: "b1",
  board_column_id: "done",
  sprint_id: "s41",
  status: "done",
  priority: "p2",
  due_date: null,
  human_tokens: null,
  // 05:00Z is noon in Saigon: the business day is the date written.
  completed_at: "2026-10-08T05:00:00Z",
  assignee_id: "me",
  metadata: {},
  ...over,
});
const rail = (open: MyWeekRow[], d: MyWeekCard[], pastDone: MyWeekCard[] = []) =>
  sprintRail({ open, done: d, pastDone, span: SPAN, today: FRIDAY, weekOf: sprintWeekOf });

describe("sprintRail", () => {
  it("counts every card once in the ring and says which day of the sprint it is", () => {
    const r = rail([row({ id: "a", doing: true }), row({ id: "b" }), row({ id: "c" })], [done({}), done({})]);
    expect(r.ring).toEqual({ closed: 2, doing: 1, waiting: 2, total: 5, dayIndex: 2, days: 7 });
  });

  it("picks Next up from cards not yet started: most late, then priority, then due date", () => {
    const r = rail(
      [
        row({ id: "started", doing: true, lateDays: 9 }),
        row({ id: "p1-soon", priority: "p1", due: "2026-10-10" }),
        row({ id: "late-p3", priority: "p3", lateDays: 2, due: "2026-10-07" }),
        row({ id: "late-p2", lateDays: 2, due: "2026-10-07" }),
      ],
      [],
    );
    expect(r.nextUp?.id).toBe("late-p2");
    expect(rail([row({ id: "p2" }), row({ id: "p1", priority: "p1" })], []).nextUp?.id).toBe("p1");
    expect(rail([row({ doing: true })], []).nextUp).toBeNull();
  });

  it("earns badges from this sprint's finished cards only", () => {
    const earned = (d: MyWeekCard[]) => rail([], d).badges.filter((b) => b.earned).map((b) => b.id);
    expect(earned([])).toEqual([]);
    expect(earned([done({})])).toEqual(["first"]);
    expect(earned([done({ priority: "p1" })])).toEqual(["first", "p1"]);
    // Finished on the 8th: before a due date of the 9th, after one of the 7th.
    expect(earned([done({ due_date: "2026-10-09" })])).toEqual(["first", "early"]);
    expect(earned([done({ due_date: "2026-10-07" })])).toEqual(["first", "comeback"]);
    expect(earned(Array.from({ length: 10 }, () => done({})))).toEqual(["first", "five", "ten"]);
    // An unearned badge says how to earn it.
    expect(rail([], []).badges.find((b) => b.id === "five")?.how).toBe("Finish five cards this sprint.");
  });

  it("feeds the plant in the order cards were finished", () => {
    const later = done({ title: "Second", completed_at: "2026-10-08T09:00:00Z" });
    const first = done({ title: "First", completed_at: "2026-10-07T03:00:00Z" });
    expect(rail([], [later, first]).fed.map((f) => f.title)).toEqual(["First", "Second"]);
  });

  it("grows the garden from the six sprints before this one, oldest first, an empty sprint a seed", () => {
    const r = rail([], [], [done({ completed_at: "2026-10-02T05:00:00Z" }), done({ completed_at: "2026-09-30T05:00:00Z" }), done({ completed_at: "2026-09-29T05:00:00Z" })]);
    expect(r.garden.map((g) => g.week)).toEqual(["W35", "W36", "W37", "W38", "W39", "W40"]);
    // W40 ran Wed 30 Sep to Tue 6 Oct; the 29th was W39's last day.
    expect(r.garden.map((g) => g.finished)).toEqual([0, 0, 0, 0, 1, 2]);
  });

  it("reads far enough back for the whole garden", () => {
    expect(railReadSince("2026-10-07")).toBe("2026-08-26");
  });
});
