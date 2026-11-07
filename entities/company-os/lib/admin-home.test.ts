import { describe, expect, it } from "vitest";
import { adminHome } from "./admin-home";
import type { AdminHomeInput, CardIn } from "./admin-home-types";

// The Admin Home as plain values (AH.2). Two readers shaped like the two who
// asked for it: a CEO with reviews, deals, 1-1 promises and late cards, and an
// HR manager with reviews and the team's dates. Names are invented.

const TODAY = "2026-10-27"; // a Tuesday, the last day of W44's sprint
const ok = <T,>(value: T) => ({ ok: true as const, value });
const card = (id: string, due: string | null, title = `Card ${id}`): CardIn => ({ id, title, place: "Client · Board", priority: "p1", due, href: `/team/boards/b?card=${id}` });

const ceo: AdminHomeInput = {
  today: TODAY,
  hour: 9,
  addressedAs: "Avery",
  sprint: { label: "W44", lastDay: true },
  approvals: ok([]),
  reviews: ok([
    { id: "r1", subjectName: "Brook Lane", typeLabel: "Renewal review", self: false, manager: true, draft: false, href: "/surveys/m?review=r1" },
    { id: "r2", subjectName: "Cam Ho", typeLabel: "Probation review", self: false, manager: true, draft: true, href: "/surveys/m?review=r2" },
  ]),
  cards: ok({
    overdue: ["2026-10-15", "2026-09-29", "2026-10-13", "2026-09-30", "2026-10-16", "2026-10-20"].map((d, i) => card(`o${i}`, d)),
    due: [card("d1", TODAY), card("d2", "2026-10-28")],
    laterNext: null,
    myWeekHref: "/team/my-week",
  }),
  promises: ok({
    href: "/team/coaching",
    rows: [
      { id: "p1", title: "Send the link", dueOn: "2026-09-15", personName: "Dana", blocked: false },
      { id: "p2", title: "Call the bank", dueOn: "2026-11-02", personName: "Dana", blocked: false },
      { id: "p3", title: "Hand over the list", dueOn: "2026-07-15", personName: "Eli", blocked: true },
    ],
  }),
  deals: ok({
    pipelineHref: "/admin/revenue/deals",
    href: (id) => `/admin/revenue/deals/${id}`,
    rows: [
      { id: "x1", title: "Teddy", stage: "Discovery", amountUsdCents: 1_500_000, nextStep: "Follow-up call", nextStepDate: "2026-10-23" },
      { id: "x2", title: "Quill", stage: "Proposal", amountUsdCents: 4_500_000, nextStep: null, nextStepDate: TODAY },
      { id: "x3", title: "Ridge", stage: "Proposal", amountUsdCents: null, nextStep: "Check in", nextStepDate: "2026-11-02" },
    ],
  }),
  team: { href: "/admin/talent/team", away: ok([]), holidays: ok([]) },
  company: ok({ cash30: 11_344_200, openPipeline: 85_385_700, headcount: 29, openIssues: 0 }),
};

const hr: AdminHomeInput = {
  today: TODAY,
  hour: 15,
  addressedAs: "Fern",
  sprint: { label: "W44", lastDay: true },
  approvals: ok([]),
  reviews: ok([
    { id: "r3", subjectName: "Gus", typeLabel: "Probation review", self: false, manager: true, draft: false, href: "/s?review=r3" },
    { id: "r4", subjectName: "Fern", typeLabel: "Renewal review", self: true, manager: false, draft: false, href: "/s?review=r4" },
  ]),
  cards: ok({ overdue: [card("o1", "2026-10-23")], due: [], laterNext: { ...card("l1", "2026-12-31", "Build the talent pool") }, myWeekHref: "/team/my-week" }),
  team: {
    href: "/admin/talent/team",
    away: ok([{ personId: "pa", name: "Hana Vu", start: "2026-10-29", end: "2026-10-29" }]),
    probation: ok([
      { teamMemberId: "t1", name: "Ivo", startDate: "2026-09-03", endsOn: "2026-11-01", managerName: "Avery" },
      { teamMemberId: "t2", name: "Jo Park", startDate: "2026-09-14", endsOn: "2026-11-13", managerName: null },
      { teamMemberId: "t3", name: "Kit Ngo", startDate: "2026-10-12", endsOn: null, managerName: null },
      { teamMemberId: "t4", name: "Lee", startDate: "2026-06-01", endsOn: "2027-01-15", managerName: null },
    ]),
    holidays: ok([{ date: "2026-11-24", name: "Culture Day", closed: false }]),
    applications: ok({ count: 8, newest: "2026-10-19T03:00:00Z", href: "/admin/talent/applications" }),
  },
  company: ok({ cash30: 0, openPipeline: 0, headcount: 29, openIssues: 0 }),
};

describe("adminHome", () => {
  it("leads the CEO with what waits on them, five tiles at most", () => {
    const m = adminHome(ceo);
    expect(m.eyebrow).toBe("Home · Tuesday 27 October · W44 ends today");
    expect(m.greeting).toBe("Good morning, Avery");
    expect(m.summary).toBe("2 reviews to write, 2 deal follow-ups due, and 6 cards past their date.");
    expect(m.tiles.map((t) => [t.label, t.value, t.note])).toEqual([
      ["To decide", "2", "2 reviews to write"],
      ["Overdue cards", "6", "oldest from 29 Sep"],
      ["Due this sprint", "2", "1 due today"],
      ["Deal follow-ups", "2", "next steps due"],
      ["1-1 promises", "3", "1 past their date"],
    ]);
  });

  it("names each review by whose it is, and offers to continue a draft", () => {
    const m = adminHome(ceo);
    if (!m.waiting || m.waiting.failed) throw new Error("waiting missing");
    expect(m.waiting.rows.map((r) => [r.title, r.sub, r.action])).toEqual([
      ["Brook Lane’s renewal review", "Manager review", "Write review"],
      ["Cam Ho’s probation review", "Manager review · draft started", "Continue"],
    ]);
  });

  it("lists the oldest overdue cards first, five of them, and sends the rest to My Week", () => {
    const m = adminHome(ceo);
    if (!m.cards || m.cards.failed) throw new Error("cards missing");
    expect(m.cards.overdue.map((r) => r.badge?.text)).toEqual(["29 Sep", "30 Sep", "13 Oct", "15 Oct", "16 Oct"]);
    expect(m.cards.overdueMore).toEqual({ label: "1 more overdue in My week", href: "/team/my-week" });
    expect(m.cards.due.map((r) => r.badge)).toEqual([{ text: "Today", tone: "warn" }, { text: "Wed 28 Oct", tone: "neutral" }]);
  });

  it("shows promises past their date, and counts the blocked ones apart", () => {
    const m = adminHome(ceo);
    if (!m.promises || m.promises.failed) throw new Error("promises missing");
    expect(m.promises.heading).toBe("Past their date");
    expect(m.promises.rows.map((r) => [r.title, r.sub])).toEqual([["Send the link", "1-1 with Dana"]]);
    expect(m.promises.more?.label).toBe("1 more open and 1 blocked in Coaching");
  });

  it("lists deal next steps due by today and counts the week ahead", () => {
    const m = adminHome(ceo);
    if (!m.deals || m.deals.failed) throw new Error("deals missing");
    expect(m.deals.rows.map((r) => [r.title, r.sub, r.badge?.tone])).toEqual([
      ["Teddy", "Discovery · $15,000 · Follow-up call", "err"],
      ["Quill", "Proposal · $45,000", "warn"],
    ]);
    expect(m.deals.more).toBe("1 more next step by Tue 3 Nov");
  });

  it("gives the HR manager the team's dates and no deal or promise sections", () => {
    const m = adminHome(hr);
    expect(m.greeting).toBe("Good afternoon, Fern");
    expect(m.summary).toBe("2 reviews to write, a probation ending on Sunday, and 1 card past its date.");
    expect(m.tiles.map((t) => [t.label, t.note])).toEqual([
      ["To decide", "2 reviews to write"],
      ["Overdue cards", "oldest from 23 Oct"],
      ["Probation ends", "next: Ivo, Sun 1 Nov"],
      ["Away this week", "Hana Vu, Thu 29 Oct"],
    ]);
    expect(m.deals).toBeNull();
    expect(m.promises).toBeNull();
    if (!m.cards || m.cards.failed) throw new Error("cards missing");
    expect(m.cards.dueQuiet).toBe("Nothing else is due this sprint. Next: Build the talent pool, Thu 31 Dec.");
  });

  it("groups the team's week: away, probations inside 30 days, joiners inside 30 days, the next holiday, hiring", () => {
    const m = adminHome(hr);
    if (!m.team || m.team.failed) throw new Error("team missing");
    expect(m.team.groups.map((g) => [g.label, g.rows.map((r) => [r.title, r.badge?.text ?? null])])).toEqual([
      ["Away", [["Hana Vu", "Thu 29 Oct"]]],
      ["Probation ends", [["Ivo", "Sun 1 Nov"], ["Jo Park", "Fri 13 Nov"]]],
      ["New", [["Kit Ngo", "Week 3"]]],
      ["Holiday", [["Culture Day", "Tue 24 Nov"]]],
      ["Hiring", [["8 applications in review", null]]],
    ]);
    expect(m.team.groups[1].rows[0].badge?.tone).toBe("warn");
    expect(m.team.groups[2].rows[0].sub).toBe("Started Mon 12 Oct · day 16");
  });

  it("says a failed read failed instead of showing nothing", () => {
    const m = adminHome({ ...ceo, reviews: { ok: false }, deals: { ok: false }, team: { href: null, away: { ok: false } } });
    expect(m.waiting).toEqual({ failed: true });
    expect(m.deals).toEqual({ failed: true });
    expect(m.team).toEqual({ failed: true });
  });

  it("leaves out a section the reader was not given, and says when nothing needs them", () => {
    const m = adminHome({ today: TODAY, hour: 20, addressedAs: null, sprint: null, approvals: ok([]), reviews: ok([]) });
    expect(m).toMatchObject({ greeting: "Good evening", summary: "Nothing needs you today.", tiles: [], waiting: null, cards: null, deals: null, team: null, company: null });
    expect(m.eyebrow).toBe("Home · Tuesday 27 October");
  });
});
