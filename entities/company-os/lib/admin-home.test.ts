import { describe, expect, it } from "vitest";
import { adminHome } from "./admin-home";
import type { AdminHomeInput, CardIn } from "./admin-home-types";

// The Admin Home as plain values (AH.2, redrawn as AH.4). Two readers shaped like the two who
// asked for it: a CEO with reviews, deals, 1-1 promises and late cards, and an
// HR manager with reviews and the team's dates. Names are invented.

const TODAY = "2026-10-27"; // a Tuesday, the last day of W44's sprint
const ok = <T,>(value: T) => ({ ok: true as const, value });
const card = (id: string, due: string | null, title = `Card ${id}`, priority = "p1"): CardIn => ({ id, title, place: "Client · Board", priority, due, href: `/team/boards/b?card=${id}` });

const ceo: AdminHomeInput = {
  today: TODAY,
  hour: 9,
  addressedAs: "Avery",
  sprint: { label: "W44", lastDay: true },
  approvals: ok([
    { id: "a1", label: "Check claim: Pads", kind: "Reimbursement: check", askedAgo: "8d ago", href: "/admin/operations/reimbursements?claim=a1" },
    { id: "a2", label: "Check claim: Cables", kind: "Reimbursement: check", askedAgo: "2d ago", href: "/admin/operations/reimbursements?claim=a2" },
    { id: "a3", label: "Publish the post", kind: "Writer draft: publish", askedAgo: "1d ago", href: "/admin/marketing/writer/a3" },
  ]),
  reviews: ok([
    { id: "r1", subjectName: "Brook Lane", typeLabel: "Renewal review", self: false, manager: true, draft: false, href: "/surveys/m?review=r1" },
    { id: "r2", subjectName: "Cam Ho", typeLabel: "Probation review", self: false, manager: true, draft: true, href: "/surveys/m?review=r2" },
  ]),
  cards: ok({
    overdue: (
      [
        ["2026-10-15", "p1"],
        ["2026-09-29", "p1"],
        ["2026-10-13", "p2"],
        ["2026-09-30", "p3"],
        ["2026-10-16", "p2"],
        ["2026-10-20", "p2"],
      ] as const
    ).map(([d, p], i) => card(`o${i}`, d, `Card o${i}`, p)),
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
    probationHref: "/admin/talent/probation",
    away: ok([{ personId: "pa", name: "Hana Vu", start: "2026-10-29", end: "2026-10-29" }]),
    probation: ok([
      { teamMemberId: "t1", name: "Ivo", startDate: "2026-09-03", endsOn: "2026-11-01", managerName: "Avery" },
      { teamMemberId: "t2", name: "Jo Park", startDate: "2026-09-14", endsOn: "2026-11-13", managerName: null },
      { teamMemberId: "t3", name: "Kit Ngo", startDate: "2026-10-12", endsOn: null, managerName: null },
      { teamMemberId: "t4", name: "Lee", startDate: "2026-06-01", endsOn: "2027-01-15", managerName: null },
      { teamMemberId: "t5", name: "Mo Tran", startDate: "2026-08-28", endsOn: TODAY, managerName: "Fern" },
    ]),
    holidays: ok([{ date: "2026-11-24", name: "Culture Day", closed: false }]),
    applications: ok({ count: 8, newest: "2026-10-19T03:00:00Z", href: "/admin/talent/applications" }),
  },
  company: ok({ cash30: 0, openPipeline: 0, headcount: 29, openIssues: 0 }),
};

describe("adminHome", () => {
  it("opens with one sentence and no tiles, the things with a person on the other end first", () => {
    const m = adminHome(ceo);
    expect(m.eyebrow).toBe("Home · Tuesday 27 October · W44 ends today");
    expect(m.greeting).toBe("Good morning, Avery");
    expect(m.summary).toBe("3 approvals to decide, 2 reviews to write, 2 deal follow-ups due, and 6 cards past their date.");
    expect(m).not.toHaveProperty("tiles");
  });

  it("puts what is due today in Do first, and leaves it out of the lists below", () => {
    const m = adminHome(ceo);
    expect(m.first.map((r) => [r.title, r.sub, r.badge?.text])).toEqual([
      ["Quill", "$45,000 · Proposal", "Today"],
      ["Card d1", "Client · Board · P1", "Today"],
    ]);
    if (!m.cards || m.cards.failed || !m.deals || m.deals.failed) throw new Error("cards or deals missing");
    expect(m.cards.due.map((r) => r.title)).toEqual(["Card d2"]);
    expect(m.deals.rows.map((r) => r.title)).toEqual(["Teddy"]);
  });

  it("folds approvals of one kind into one row, and names each review by whose it is", () => {
    const m = adminHome(ceo);
    if (!m.waiting || m.waiting.failed) throw new Error("waiting missing");
    expect(m.waiting.note).toBe("oldest asked 8d ago");
    expect(m.waiting.rows.map((r) => [r.title, r.sub, r.href, r.action])).toEqual([
      ["Check claim (2)", "Pads · Cables", "/admin/operations/reimbursements", "Review 2"],
      ["Publish the post", "Writer draft: publish · asked 1d ago", "/admin/marketing/writer/a3", "Decide"],
      ["Brook Lane’s renewal review", "Manager review", "/surveys/m?review=r1", "Write review"],
      ["Cam Ho’s probation review", "Manager review · draft started", "/surveys/m?review=r2", "Continue"],
    ]);
  });

  it("opens a folded group in place, each row with its own buttons when the reader may act", () => {
    const mark = { submittedAt: "2026-10-19T00:00:00Z", totalVnd: 2_400_000 };
    const acted = adminHome({
      ...ceo,
      approvals: ok([
        { id: "a1", label: "Check claim: Pads", kind: "Reimbursement: check", askedAgo: "8d ago", href: "/c?claim=a1", amount: "2,400,000 ₫", act: { kind: "claim", stage: "check", claimId: "c1", mark } },
        { id: "a2", label: "Check claim: Cables", kind: "Reimbursement: check", askedAgo: "2d ago", href: "/c?claim=a2", amount: "90,000 ₫", act: null },
      ]),
    });
    if (!acted.waiting || acted.waiting.failed) throw new Error("waiting missing");
    const group = acted.waiting.rows[0];
    expect(group.children?.map((r) => [r.title, r.sub, r.action, r.act?.kind ?? null])).toEqual([
      ["Pads", "2,400,000 ₫ · asked 8d ago", null, "claim"],
      ["Cables", "90,000 ₫ · asked 2d ago", "Decide", null],
    ]);
  });

  it("gives a deal its Logged and Snooze only to a reader who may edit the pipeline", () => {
    const m = adminHome({ ...ceo, deals: ok({ ...(ceo.deals as { ok: true; value: Parameters<typeof adminHome>[0]["deals"] extends infer D ? D extends { ok: true; value: infer V } ? V : never : never }).value, canLog: true }) });
    expect(m.first[0].act).toEqual({ kind: "deal", dealId: "x2", nextStep: null, nextStepDate: TODAY, today: TODAY });
    expect(adminHome(ceo).first[0].act).toBeNull();
  });

  it("lists late cards by priority then age, says how late, and nudges a re-plan of the low ones", () => {
    const m = adminHome(ceo);
    if (!m.cards || m.cards.failed) throw new Error("cards missing");
    expect(m.cards.note).toBe("6 late · 2 this sprint");
    expect(m.cards.late.map((r) => [r.title, r.badge?.text])).toEqual([
      ["Card o1", "28 days late"],
      ["Card o0", "12 days late"],
      ["Card o2", "14 days late"],
      ["Card o4", "11 days late"],
    ]);
    expect(m.cards.due.map((r) => r.badge)).toEqual([{ text: "Wed 28 Oct", tone: "neutral" }]);
    expect(m.cards.more).toEqual({ label: "2 more in My week", href: "/team/my-week" });
    expect(m.cards.hint).toEqual({ label: "4 late cards are P2 or lower. Re-plan them in My week", href: "/team/my-week" });
  });

  it("lists late deal next steps biggest first, totals them, and counts the week ahead", () => {
    const m = adminHome(ceo);
    if (!m.deals || m.deals.failed) throw new Error("deals missing");
    expect(m.deals.note).toBe("$15,000 waiting on a next step");
    expect(m.deals.rows.map((r) => [r.title, r.sub, r.badge])).toEqual([["Teddy", "$15,000 · Discovery · Follow-up call", { text: "4 days late", tone: "err" }]]);
    expect(m.deals.more).toBe("1 more next step by Tue 3 Nov");
  });

  it("links the late 1-1 promises from the week card", () => {
    const m = adminHome(ceo);
    expect(m.week).toEqual({ failed: false, href: "/admin/talent/team", days: [], links: [{ label: "1-1 promises: 1 past its date", href: "/team/coaching" }] });
  });

  it("gives the HR manager today's probation decision first, and no deal section", () => {
    const m = adminHome(hr);
    expect(m.greeting).toBe("Good afternoon, Fern");
    expect(m.summary).toBe("A probation to decide today, 2 reviews to write, a probation ending on Sunday, and 1 card past its date.");
    expect(m.first).toEqual([
      {
        key: "prob:t5",
        title: "Mo Tran’s probation ends today",
        sub: "Started Fri 28 Aug · manager Fern",
        href: "/admin/talent/probation",
        badge: null,
        action: "Decide",
        initials: "MT",
        act: null,
        children: null,
      },
    ]);
    // With onboarding.manage the row carries the decision instead of a link to it.
    const decider = adminHome({ ...hr, team: { ...hr.team!, canDecide: true } });
    expect([decider.first[0].action, decider.first[0].act]).toEqual([null, { kind: "probation", teamMemberId: "t5" }]);
    expect(m.deals).toBeNull();
    if (!m.cards || m.cards.failed) throw new Error("cards missing");
    expect(m.cards.note).toBe("1 late");
    expect(m.cards.quiet).toBe("Nothing else is due this sprint. Next: Build the talent pool, Thu 31 Dec.");
    expect(m.cards.hint).toBeNull();
  });

  it("draws the team's fortnight as days, with the counts as links", () => {
    const m = adminHome(hr);
    if (!m.week || m.week.failed) throw new Error("week missing");
    expect(m.week.days.map((d) => [d.label, d.today, d.events.map((e) => e.text)])).toEqual([
      ["Today", true, ["Mo Tran’s probation ends"]],
      ["Thu 29 Oct", false, ["Hana Vu away"]],
      ["Sun 1 Nov", false, ["Ivo’s probation ends"]],
    ]);
    expect(m.week.links).toEqual([
      { label: "1 new joiner in their first month", href: "/admin/talent/probation" },
      { label: "8 applications in review", href: "/admin/talent/applications" },
    ]);
  });

  it("says a failed read failed instead of showing nothing", () => {
    const m = adminHome({ ...ceo, reviews: { ok: false }, deals: { ok: false }, promises: { ok: false }, team: { href: null, away: { ok: false } } });
    expect(m.waiting).toEqual({ failed: true });
    expect(m.deals).toEqual({ failed: true });
    expect(m.week).toEqual({ failed: true });
    const noTeam = adminHome({ ...ceo, promises: { ok: false }, team: undefined });
    expect(noTeam.week).toEqual({ failed: false, href: null, days: [], links: [{ label: "Couldn’t load your 1-1 promises", href: null }] });
  });

  it("leaves out a section the reader was not given, and says when nothing needs them", () => {
    const m = adminHome({ today: TODAY, hour: 20, addressedAs: null, sprint: null, approvals: ok([]), reviews: ok([]) });
    expect(m).toMatchObject({ greeting: "Good evening", summary: "Nothing needs you today.", first: [], waiting: null, cards: null, deals: null, week: null, company: null });
    expect(m.eyebrow).toBe("Home · Tuesday 27 October");
  });
});
