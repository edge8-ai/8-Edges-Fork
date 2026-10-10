// The team assistant's my_* tools, for two employees, Ana and Bao. Each tool
// must hand back only the signed-in person's own rows, and must ignore any
// person the model names in its input. The fake database ignores filters, so
// where a tool runs its own query both employees' rows come back and the body
// has to drop the other one; where a tool reuses a door reader, the reader is
// faked per person and the test checks it was asked about the session's actor.
// Every assertion reads the tool result, which is exactly what the model sees.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

const { readMyWeek, getMyGoals, getMyCoaching, getMyHistory, getMyNotes, listMyClaims, getMemberLeave } = vi.hoisted(() => ({
  readMyWeek: vi.fn(),
  getMyGoals: vi.fn(),
  getMyCoaching: vi.fn(),
  getMyHistory: vi.fn(),
  getMyNotes: vi.fn(),
  listMyClaims: vi.fn(),
  getMemberLeave: vi.fn(),
}));

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (t: string) => builderFor(t) } }));
vi.mock("@/kernel/identity/reads", () => ({ selectCompanies: (c: string) => builderFor("companies").select(c) }));
vi.mock("@/kernel/identity/team-auth", () => ({ PORTAL_STATUSES: ["active"] }));
vi.mock("@/entities/billing", () => ({ selectOrders: vi.fn() }));
vi.mock("@/entities/crm", () => ({ seesEveryClient: vi.fn(), selectDeals: vi.fn(), selectLead: vi.fn(), selectPipelineStages: vi.fn() }));
vi.mock("@/entities/ideas", () => ({ selectIdeas: vi.fn() }));
vi.mock("@/entities/retreats", () => ({ selectEvents: vi.fn() }));
vi.mock("@/entities/site", () => ({ listGalleryPhotos: vi.fn() }));
vi.mock("@/entities/org", () => ({
  selectCompanyInformation: vi.fn(),
  selectTeamDirectory: vi.fn(),
  selectKeyResults: (c: string) => builderFor("key_results").select(c),
}));
vi.mock("@/entities/contacts", () => ({
  selectPersonCompanies: vi.fn(),
  selectStaffAssignments: vi.fn(),
  selectPeopleSensitive: (c: string) => builderFor("people_sensitive").select(c),
}));
vi.mock("@/entities/finance", () => ({
  INVOICE_VOIDED: "voided",
  selectInvoices: vi.fn(),
  selectExpenses: vi.fn(),
  selectProducts: vi.fn(),
  selectCompensationSensitive: (c: string) => builderFor("compensation_sensitive").select(c),
  selectPayrollLinesSensitive: (c: string) => builderFor("payroll_lines_sensitive").select(c),
  selectPayrollRunsSensitive: (c: string) => builderFor("payroll_runs_sensitive").select(c),
}));
vi.mock("@/entities/time-off", () => ({
  selectTimeOff: (c: string) => builderFor("time_off").select(c),
  getMemberLeave,
  hoursToDays: (h: number, perDay: number) => h / perDay,
}));
vi.mock("@/entities/reimbursements", () => ({ listMyClaims }));
vi.mock("@/entities/coaching", () => ({ getMyGoals, getMyCoaching, getMyHistory, getMyNotes }));
// The week model is boards' own and pinned by its tests; here it only has to
// carry the read's open cards through, so the test sees which cards came in.
vi.mock("@/entities/boards", () => ({
  readMyWeek,
  sprintStartOf: () => "2026-10-07",
  summaryLine: () => "1 due today.",
  myWeek: (read: { cards: { id: string; title: string; status: string; priority: string; due_date: string | null; human_tokens: number | null }[] }, today: string) => ({
    week: "2026-W41",
    window: { startsOn: "2026-10-07", endsOn: "2026-10-13" },
    isLastDay: false,
    today,
    doing: [],
    now: read.cards
      .filter((c) => c.status === "open")
      .map((c) => ({ id: c.id, title: c.title, priority: c.priority, href: `/team/boards/b?card=${c.id}`, place: "Board", due: c.due_date, lateDays: 0, carried: false, carriedFrom: null, doing: false, fresh: false, waitingOn: null, ht: c.human_tokens })),
    fresh: [],
    days: [],
    later: [],
    undated: [],
    counts: { open: 1, doing: 0, doingLate: 0, late: 0, dueToday: 1, waiting: 0, finished: 0, otherOpen: 0 },
    openTokens: null,
    unsized: 0,
  }),
}));

import type { TeamActor } from "@/kernel/identity/team-auth";
import { isMyTool, runMyTool } from "./run-tool";
import { subjectMaySee } from "./my-work-tools";

const actor = (who: "ana" | "bao"): TeamActor =>
  ({
    authUserId: `auth-${who}`,
    personId: `person-${who}`,
    teamMemberId: `tm-${who}`,
    role: "employee",
    displayName: who,
    greeting: who,
    name: who,
    avatarUrl: null,
    email: `${who}@example.com`,
    teamMemberScope: [`tm-${who}`],
    personScope: [`person-${who}`],
    directReportIds: [],
    isAdmin: false,
  }) as unknown as TeamActor;

const ANA = actor("ana");
const BAO = actor("bao");
// What a model might try: point the tool at the other employee.
const POINT_AT = (who: TeamActor) => ({ personId: who.personId, person_id: who.personId, teamMemberId: who.teamMemberId, team_member_id: who.teamMemberId, name: who.name });

const filtersOn = (table: string) => calls.filter((c) => c.table === table).flatMap((c) => c.filters);
const run = async (name: string, me: TeamActor, input: Record<string, unknown> = {}) => {
  const out = await runMyTool(name, input, me);
  expect(out.isError).toBe(false);
  return { body: JSON.parse(out.content), raw: out.content };
};

const card = (id: string, assignee: string, status = "open") => ({
  id,
  title: `Card ${id}`,
  board_id: null,
  board_column_id: null,
  sprint_id: null,
  status,
  priority: "high",
  due_date: "2026-10-10",
  human_tokens: 1,
  completed_at: status === "done" ? "2026-10-08T03:00:00Z" : null,
  assignee_id: assignee,
  metadata: null,
});

beforeEach(() => {
  resetFake();
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

it("offers exactly the seven my_* tools", () => {
  for (const name of ["my_work", "my_goals", "my_reviews", "my_coaching", "my_time_off", "my_pay", "my_reimbursements"]) {
    expect(isMyTool(name)).toBe(true);
  }
  expect(isMyTool("company_totals")).toBe(false);
});

describe("my_work", () => {
  beforeEach(() => {
    readMyWeek.mockImplementation(async (personId: string) => ({
      boards: [],
      sprints: [],
      blockers: [],
      // A wrong row slipped into each read: the other person's card.
      cards:
        personId === "person-ana"
          ? [card("ana-1", "person-ana"), card("ana-done", "person-ana", "done"), card("bao-leak", "person-bao")]
          : [card("bao-1", "person-bao"), card("ana-leak", "person-ana")],
    }));
  });

  it("reads each employee's own week and lists only their own cards", async () => {
    const ana = await run("my_work", ANA);
    expect(readMyWeek).toHaveBeenLastCalledWith("person-ana", "2026-10-07");
    expect(ana.body.today_lateDueTodayAndWaitingOnYou.map((r: { title: string }) => r.title)).toEqual(["Card ana-1"]);
    expect(ana.body.recentlyDone.map((r: { title: string }) => r.title)).toEqual(["Card ana-done"]);
    expect(ana.raw).not.toMatch(/bao/);

    const bao = await run("my_work", BAO);
    expect(readMyWeek).toHaveBeenLastCalledWith("person-bao", "2026-10-07");
    expect(bao.body.today_lateDueTodayAndWaitingOnYou.map((r: { title: string }) => r.title)).toEqual(["Card bao-1"]);
    expect(bao.raw).not.toMatch(/\bana\b|ana-|-ana/);
  });

  it("ignores a person the model names in the input", async () => {
    const out = await run("my_work", ANA, POINT_AT(BAO));
    expect(readMyWeek).toHaveBeenCalledWith("person-ana", "2026-10-07");
    expect(readMyWeek).not.toHaveBeenCalledWith("person-bao", expect.anything());
    expect(out.raw).not.toMatch(/Card bao/);
  });
});

describe("my_goals", () => {
  const goal = (title: string, kr: string | null) => ({
    id: `g-${title}`,
    title,
    descriptionMarkdown: null,
    status: "active",
    quarterLabel: "2026Q4",
    letterMd: "SEALED-LETTER",
    letterSealedOn: "2026-10-01",
    ladder: kr ? { kind: "key_result", id: kr, label: `KR ${kr}` } : null,
    comments: [],
    metricUnit: "posts",
    startValue: 0,
    targetValue: 10,
    currentValue: 4,
    dueDate: "2026-12-31",
    stretchMarkdown: null,
    createdBy: null,
  });

  it("returns each employee's own goals, never the sealed letter, and ignores a named person", async () => {
    getMyGoals.mockImplementation(async (me: TeamActor) => (me.teamMemberId === "tm-ana" ? [goal("Ana ships", "kr-1")] : [goal("Bao learns", null)]));
    script("key_results", { data: [{ id: "kr-1", title: "Ship eight", current_value: 3, target_value: 8, unit: null, status: "on_track" }] });

    const ana = await run("my_goals", ANA, POINT_AT(BAO));
    expect(getMyGoals).toHaveBeenCalledWith(ANA);
    expect(ana.body.goals).toEqual([expect.objectContaining({ title: "Ana ships", progressPercent: 40, companyKeyResult: expect.objectContaining({ title: "Ship eight" }) })]);
    expect(ana.raw).not.toMatch(/Bao learns|SEALED-LETTER/);

    const bao = await run("my_goals", BAO);
    expect(getMyGoals).toHaveBeenLastCalledWith(BAO);
    expect(bao.body.goals.map((g: { title: string }) => g.title)).toEqual(["Bao learns"]);
    expect(bao.raw).not.toMatch(/Ana ships|SEALED-LETTER/);
  });
});

describe("my_reviews", () => {
  const review = (id: string, tm: string, rater: string, status: string) => ({
    id,
    team_member_id: tm,
    cycle_label: "2026 mid-year",
    review_type: "mid_year",
    rater_kind: rater,
    reviewer_name: `Reviewer ${id}`,
    // Never selected; here so a leak would show in the output.
    reviewer_email: `${id}@example.com`,
    access_token: "secret-token",
    status,
    submitted_at: "2026-09-01T00:00:00Z",
    period_start: null,
    period_end: null,
    overall_rating: "meets",
    rating_scale: null,
    ratings: {},
    achievements: `achievements ${id}`,
    improvements: null,
    comments: null,
    summary: null,
    decision: null,
    keeper: null,
    acknowledged_at: null,
  });
  const BOTH = [
    review("ana-self", "tm-ana", "self", "submitted"),
    review("ana-mgr", "tm-ana", "manager", "finalized"),
    review("ana-mgr-draft", "tm-ana", "manager", "draft"),
    review("ana-peer", "tm-ana", "reviewer", "submitted"),
    review("bao-self", "tm-bao", "self", "submitted"),
    review("bao-mgr", "tm-bao", "manager", "finalized"),
  ];

  it("gives each employee every review about them, drafts and other reviewers included", async () => {
    script("performance_reviews", { data: BOTH }, { data: BOTH });
    const ana = await run("my_reviews", ANA, POINT_AT(BAO));
    expect(filtersOn("performance_reviews")).toContainEqual(["eq", "team_member_id", "tm-ana"]);
    expect(ana.body.reviews.map((r: { side: string }) => r.side)).toEqual([
      "your self-assessment",
      "your manager's review",
      "your manager's review",
      "another reviewer's review",
    ]);
    // Only the rows /team/reviews opens for the subject carry a link.
    expect(ana.body.reviews.map((r: { link: string | null }) => r.link)).toEqual(["/team/reviews/ana-self", "/team/reviews/ana-mgr", null, null]);
    expect(ana.body.reviews[3].reviewer).toBe("Reviewer ana-peer");
    expect(ana.raw).not.toMatch(/bao|@example\.com|secret-token/);

    const bao = await run("my_reviews", BAO);
    expect(bao.body.reviews.map((r: { link: string }) => r.link)).toEqual(["/team/reviews/bao-self", "/team/reviews/bao-mgr"]);
    expect(bao.raw).not.toMatch(/\bana\b|ana-|-ana/);
  });

  it("follows the subject's visibility rule from /team/reviews", () => {
    expect(subjectMaySee({ rater_kind: "self", status: "draft" })).toBe(true);
    expect(subjectMaySee({ rater_kind: "manager", status: "submitted" })).toBe(false);
    expect(subjectMaySee({ rater_kind: "manager", status: "finalized" })).toBe(true);
    expect(subjectMaySee({ rater_kind: "reviewer", status: "finalized" })).toBe(false);
    expect(subjectMaySee({ rater_kind: "external", status: "finalized" })).toBe(false);
  });
});

describe("my_coaching", () => {
  const coaching = (who: string) => ({
    profileId: `profile-${who}`,
    coachName: "Coach",
    cadenceDays: 14,
    nextOneOnOneOn: "2026-10-14",
    nextStartsAt: "10:00",
    suggestedOn: null,
    proposedOn: null,
    missedOn: null,
    nextPrepMarkdown: `prep for ${who}`,
    nextPrepEdits: { struck: [], added: [] },
    preMeeting: { answers: {}, previous: null, coachNote: null },
    priorities: [],
    commitments: [{ title: `${who} promise`, owner: "member", dueOn: null, status: "open", statusNote: null }],
    talkingPoints: [],
    checkins: [],
    ocean: null,
    howIWork: { bestHours: null, feedback: null, quiet: null, curious: null },
  });

  it("reads each employee's own member-tier coaching, and ignores a named person", async () => {
    const byMember = (me: TeamActor) => (me.teamMemberId === "tm-ana" ? "ana" : "bao");
    getMyCoaching.mockImplementation(async (me: TeamActor) => coaching(byMember(me)));
    getMyHistory.mockImplementation(async (me: TeamActor) => [{ heldOn: "2026-10-01", sharedSummaryMarkdown: `${byMember(me)} recap`, made: 1, kept: 1 }]);
    getMyNotes.mockImplementation(async (me: TeamActor) => [{ id: "n", createdAt: "2026-10-02", body: `${byMember(me)} note` }]);

    const ana = await run("my_coaching", ANA, POINT_AT(BAO));
    for (const fn of [getMyCoaching, getMyHistory, getMyNotes]) expect(fn).toHaveBeenCalledWith(ANA);
    expect(ana.body.commitments[0].title).toBe("ana promise");
    expect(ana.body.held1to1s[0].sharedRecap).toBe("ana recap");
    expect(ana.raw).not.toMatch(/bao/);

    const bao = await run("my_coaching", BAO);
    expect(bao.body.yourNotes[0].body).toBe("bao note");
    expect(bao.raw).not.toMatch(/\bana\b|ana-|-ana/);
  });

  it("says so when the person has no coaching profile", async () => {
    getMyCoaching.mockResolvedValue(null);
    getMyHistory.mockResolvedValue([]);
    getMyNotes.mockResolvedValue([]);
    expect((await run("my_coaching", ANA)).body.coaching).toBeNull();
  });
});

describe("my_time_off", () => {
  const leave = (tm: string, reason: string) => ({
    team_member_id: tm,
    leave_type: "vacation",
    status: "approved",
    start_date: "2026-10-20",
    end_date: "2026-10-21",
    days: 2,
    hours: null,
    is_half_day: false,
    reason,
    manager_note: `${reason} noted`,
    requested_at: null,
    approved_at: null,
  });
  const BOTH = [leave("tm-ana", "ana wedding"), leave("tm-bao", "bao surgery")];

  it("shows each employee their own leave with its reason and note, and their own balance", async () => {
    script("time_off", { data: BOTH }, { data: BOTH });
    getMemberLeave.mockImplementation(async (ids: string[]) => new Map(ids.map((id) => [id, { policy: { name: `${id} policy`, accrual: { hoursPerDay: 8 } }, balance: { hasRules: true, remainingHours: 80, pendingHours: 0, usedPolicyYearHours: 16, policyYearStart: null, policyYearEnd: null, nextAccrual: null, nextCapCheck: null } }])));

    const ana = await run("my_time_off", ANA, POINT_AT(BAO));
    expect(filtersOn("time_off")).toContainEqual(["eq", "team_member_id", "tm-ana"]);
    expect(getMemberLeave).toHaveBeenCalledWith(["tm-ana"]);
    expect(ana.body.requests).toEqual([expect.objectContaining({ reason: "ana wedding", managerNote: "ana wedding noted" })]);
    expect(ana.body.balance).toMatchObject({ policy: "tm-ana policy", remainingDays: 10 });
    expect(ana.raw).not.toMatch(/bao/);

    const bao = await run("my_time_off", BAO);
    expect(bao.body.requests.map((r: { reason: string }) => r.reason)).toEqual(["bao surgery"]);
    expect(bao.raw).not.toMatch(/\bana\b|ana-|-ana/);
  });
});

describe("my_pay", () => {
  const comp = (tm: string, vnd: number) => ({
    team_member_id: tm,
    comp_type: "base_salary",
    pay_period: "monthly",
    amount_cents: 100000,
    currency: "usd",
    salary_vnd: vnd,
    salary_usd_cents: 100000,
    effective_from: "2026-01-01",
    effective_to: null,
    is_current: true,
    change_reason: null,
  });
  const line = (tm: string, net: number) => ({ team_member_id: tm, payroll_run_id: "run-9", net_salary_vnd: net, gross_salary_vnd: net + 1 });
  const bank = (who: string, account: string) => ({ person_id: `person-${who}`, bank_name: "VCB", bank_account_number: account });

  function scriptBoth() {
    script("compensation_sensitive", { data: [comp("tm-ana", 11111111), comp("tm-bao", 22222222)] });
    script("payroll_lines_sensitive", { data: [line("tm-ana", 33333333), line("tm-bao", 44444444)] });
    script("people_sensitive", { data: [bank("ana", "0011-2233-1234"), bank("bao", "9988776655")] });
    script("payroll_runs_sensitive", { data: [{ id: "run-9", period: "2026-09", status: "paid", is_estimate: false, working_days: 22, archived_at: null }] });
  }

  it("shows each employee their own salary, payslips and only the last four digits of their own account", async () => {
    scriptBoth();
    const ana = await run("my_pay", ANA, POINT_AT(BAO));
    expect(filtersOn("compensation_sensitive")).toContainEqual(["eq", "team_member_id", "tm-ana"]);
    expect(filtersOn("payroll_lines_sensitive")).toContainEqual(["eq", "team_member_id", "tm-ana"]);
    expect(filtersOn("people_sensitive")).toContainEqual(["eq", "person_id", "person-ana"]);
    expect(ana.body.compensation.map((c: { salaryVnd: number }) => c.salaryVnd)).toEqual([11111111]);
    expect(ana.body.payslips).toEqual([expect.objectContaining({ period: "2026-09", net_salary_vnd: 33333333 })]);
    expect(ana.body.bankAccount).toEqual({ bank: "VCB", last4: "1234" });
    expect(ana.raw).not.toMatch(/22222222|44444444|9988|0011-2233|bao/);

    scriptBoth();
    const bao = await run("my_pay", BAO);
    expect(bao.body.compensation.map((c: { salaryVnd: number }) => c.salaryVnd)).toEqual([22222222]);
    expect(bao.body.bankAccount.last4).toBe("6655");
    expect(bao.raw).not.toMatch(/11111111|33333333|1234|ana/);
  });

  it("says a failed pay read is a failure, not an empty payslip", async () => {
    script("compensation_sensitive", { error: { message: "permission denied" } });
    script("payroll_lines_sensitive", { data: [] });
    script("people_sensitive", { data: [] });
    const out = await runMyTool("my_pay", {}, ANA);
    expect(out).toEqual({ isError: true, content: expect.stringMatching(/lookup failed/) });
  });
});

describe("my_reimbursements", () => {
  it("lists each employee's own claims, read by the session's person id", async () => {
    listMyClaims.mockImplementation(async (personId: string) => [
      { id: `claim-${personId}`, title: `${personId} taxi`, status: "submitted", receipts: 1, totalVnd: 100000, ratePending: 0, line: "Waiting for a check" },
    ]);
    const ana = await run("my_reimbursements", ANA, POINT_AT(BAO));
    expect(listMyClaims).toHaveBeenCalledWith("person-ana");
    expect(ana.body.claims).toEqual([expect.objectContaining({ title: "person-ana taxi", link: "/team/claims/claim-person-ana" })]);
    expect(ana.raw).not.toMatch(/bao/);

    const bao = await run("my_reimbursements", BAO);
    expect(listMyClaims).toHaveBeenLastCalledWith("person-bao");
    expect(bao.raw).not.toMatch(/\bana\b|ana-|-ana/);
  });
});
