import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Characterisation tests for the onboarding cycle's pure clock rules and for
// one milestone's date condition. The milestones were lifted out of one long
// `runOnboardingCycle` loop; these pin the conditions that decide whether an
// email goes out at all.

type EmailArgs = { to: string | string[]; subject: string; html: string };
const sendTransactionalEmail = vi.fn(async (_args: EmailArgs) => true);

// The onboarding cycle reads applications and requisitions through hiring's
// door; that barrel is server-only (it pulls React's `cache`). These tests
// exercise the clock rules and one milestone, never a read, so the door is
// stubbed with readers that fail loudly if a test ever does reach one.
vi.mock("@/entities/hiring", () => {
  const unused = () => {
    throw new Error("these tests do not read hiring; give the reader a fixture if that changes");
  };
  return { selectApplications: unused, selectJobRequisitions: unused };
});
// companyOs is the house fake: savePlanLink's write is scripted, and any other
// query in these tests would throw as unscripted.
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) }, supabase: {} }));
vi.mock("@/kernel/messaging/email", () => ({
  sendTransactionalEmail: (args: EmailArgs) => sendTransactionalEmail(args),
}));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: () => "https://edge8.test" }));
// AC.15: a manager is mailed a link only when they may open the page it points
// at. A test names the addresses that may not.
const cannotOpen = vi.hoisted(() => new Set<string>());
vi.mock("@/kernel/identity/may-open", () => ({
  emailsWhoMayOpen: vi.fn(async (emails: string[]) => emails.filter((e) => !cannotOpen.has(e))),
}));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => {}) }));
// Each call records its patch and the .eq filters chained on it, and resolves
// with whatever error the test sets.
const teamMemberWrites: { patch: Record<string, unknown>; filters: [string, unknown][] }[] = [];
let teamMemberWriteError: { message: string } | null = null;
vi.mock("@/kernel/identity/writes", () => ({
  updateTeamMembers: (patch: Record<string, unknown>) => {
    const write = { patch, filters: [] as [string, unknown][] };
    teamMemberWrites.push(write);
    const chain = {
      eq(column: string, value: unknown) {
        write.filters.push([column, value]);
        return chain;
      },
      then(resolve: (r: { error: { message: string } | null }) => unknown) {
        return Promise.resolve({ error: teamMemberWriteError }).then(resolve);
      },
    };
    return chain;
  },
}));

import { computeStage, cycleDay, getAllCycleRows, markStarted, savePlanLink, type CycleRow, type CycleRunSummary } from "./cycle";

describe("savePlanLink", () => {
  beforeEach(() => {
    resetFake();
  });

  it("stores a pasted link through externalHref, adding https to a bare host", async () => {
    script("onboarding_plans", {}, {});
    expect(await savePlanLink("j1", "  docs.google.com/document/d/abc  ", "tm1")).toEqual({ ok: true });
    expect(await savePlanLink("j2", "example.com:8080/plan", null)).toEqual({ ok: true });
    const written = calls.map((c) => {
      const row = c.payloads[0] as Record<string, unknown>;
      return [c.table, row.plan_url, row.plan_path, c.filters];
    });
    expect(written).toEqual([
      ["onboarding_plans", "https://docs.google.com/document/d/abc", null, [["eq", "id", "j1"]]],
      ["onboarding_plans", "https://example.com:8080/plan", null, [["eq", "id", "j2"]]],
    ]);
  });

  it("refuses anything that is not a web link, and writes nothing", async () => {
    for (const bad of ["", "   ", "notes", "localhost:3000", "javascript:alert(1)", "mailto:a@b.com", `a.co/${"x".repeat(2000)}`]) {
      expect(await savePlanLink("j1", bad, "tm1")).toEqual({
        ok: false,
        error: "Paste a valid link (e.g. a Google Doc URL).",
      });
    }
    expect(calls).toHaveLength(0);
  });
});

describe("markStarted", () => {
  beforeEach(() => {
    teamMemberWrites.length = 0;
    teamMemberWriteError = null;
  });

  it("flips pre_start to active and pre_boarding to probation, each only from the old value", async () => {
    expect(await markStarted("tm1")).toBeNull();
    expect(teamMemberWrites).toEqual([
      { patch: { status: "active" }, filters: [["id", "tm1"], ["status", "pre_start"]] },
      { patch: { employment_stage: "probation" }, filters: [["id", "tm1"], ["employment_stage", "pre_boarding"]] },
    ]);
  });

  it("returns the error instead of swallowing it", async () => {
    teamMemberWriteError = { message: "permission denied" };
    expect(await markStarted("tm1")).toBe("permission denied");
  });
});
import { day60PromotionMilestone, day8SurveyMilestone, decisionReminderMilestone, planNagMilestone, type MilestoneCtx } from "./milestones";
import { releaseJourneyStamp } from "./journey-claim";

const member = (over: Partial<CycleRow["member"]> = {}): CycleRow["member"] => ({
  personId: "p1",
  name: "Mai",
  greeting: "Mai",
  email: "mai@example.com",
  avatarUrl: null,
  positionTitle: "Analyst",
  startDate: "2026-08-01",
  managerId: "m1",
  status: "active",
  employmentStage: "probation",
  probationEndsOn: null,
  contractStartDate: null,
  ...over,
});

const row = (over: Partial<CycleRow> = {}): CycleRow =>
  ({
    id: "j1",
    team_member_id: "tm1",
    stage: "day_1",
    plan_url: null,
    plan_path: null,
    plan_uploaded_at: null,
    day8_survey_sent_at: null,
    day8_response_id: null,
    day45_email_sent_at: null,
    decision: null,
    decision_at: null,
    day60_promoted_at: null,
    day180_email_sent_at: null,
    completed_at: null,
    member: member(),
    ...over,
  }) as CycleRow;

describe("cycleDay", () => {
  it("counts start_date as Day 1 and the day before as Day 0", () => {
    expect(cycleDay("2026-08-01", "2026-08-01")).toBe(1);
    expect(cycleDay("2026-08-01", "2026-07-31")).toBe(0);
    expect(cycleDay("2026-08-01", "2026-07-26")).toBe(-5);
    expect(cycleDay("2026-08-01", "2026-08-08")).toBe(8);
  });
});

describe("computeStage", () => {
  it("is complete once Day 180 has gone out or the journey is closed", () => {
    expect(computeStage(row({ day180_email_sent_at: "2027-01-01" }), "2026-08-01")).toBe("complete");
    expect(computeStage(row({ completed_at: "2027-01-01" }), "2026-08-01")).toBe("complete");
  });

  it("is preboarding with no start date, or before Day 1", () => {
    expect(computeStage(row({ member: member({ startDate: null }) }), "2026-08-01")).toBe("preboarding");
    expect(computeStage(row(), "2026-07-30")).toBe("preboarding");
  });

  it("walks day_1 -> day_8 -> day_45 -> day_60 on the default 60-day probation", () => {
    expect(computeStage(row(), "2026-08-01")).toBe("day_1"); // d = 1
    expect(computeStage(row(), "2026-08-08")).toBe("day_8"); // d = 8
    // probation ends start + 59 = 2026-09-29; day_45 opens 15 days before.
    expect(computeStage(row(), "2026-09-14")).toBe("day_45");
    expect(computeStage(row(), "2026-09-29")).toBe("day_60");
  });

  it("follows an extended probation end date", () => {
    const extended = row({ member: member({ probationEndsOn: "2026-10-29" }) });
    expect(computeStage(extended, "2026-09-29")).toBe("day_8");
    expect(computeStage(extended, "2026-10-14")).toBe("day_45");
    expect(computeStage(extended, "2026-10-29")).toBe("day_60");
  });

  it("treats a recorded promotion as day_60 regardless of the clock", () => {
    expect(computeStage(row({ day60_promoted_at: "2026-08-05" }), "2026-08-08")).toBe("day_60");
  });

  it("reaches day_180 at Day 180", () => {
    expect(computeStage(row(), "2027-01-27")).toBe("day_180"); // d = 180
  });
});

describe("planNagMilestone", () => {
  const summary = (): CycleRunSummary =>
    ({
      date: "2026-07-28",
      journeys: 1,
      backfilled: 0,
      planNags: 0,
      day8Sent: 0,
      reviewsSent: 0,
      decisionReminders: 0,
      promoted: 0,
      day180Sent: 0,
    }) as CycleRunSummary;

  const ctx = (over: Partial<MilestoneCtx> = {}): MilestoneCtx => ({
    todayISO: "2026-07-28",
    d: cycleDay("2026-08-01", "2026-07-28"), // -3
    start: "2026-08-01",
    probEnd: "2026-09-29",
    manager: { name: "Linh", email: "linh@example.com" },
    name: "Mai",
    greeting: "Mai",
    origin: "https://edge8.test",
    boardLink: "https://edge8.test/team/onboarding",
    alreadyFullTime: false,
    summary: summary(),
    patchJourney: vi.fn(async () => ({ ok: true as const })),
    claimJourneyStamp: vi.fn(async () => true),
    releaseJourneyStamp: vi.fn(async () => {}),
    recruiterEmailFor: vi.fn(async () => null),
    ...over,
  });

  beforeEach(() => {
    sendTransactionalEmail.mockClear();
    cannotOpen.clear();
  });

  it("nags the manager and the talent director inside the T-6..Day 0 window", async () => {
    const c = ctx();
    expect(await planNagMilestone(row(), c)).toBe(false);
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    const call = sendTransactionalEmail.mock.calls[0][0];
    expect(call.to).toEqual(["linh@example.com", "mai@example.com"]);
    expect(call.subject).toBe("Onboarding plan needed before Day 1: Mai");
    expect(call.html).toContain("4 days away");
    expect(c.summary.planNags).toBe(1);
  });

  it("leaves a manager who may not open the onboarding board off the nag, and still tells the talent inbox (AC.15)", async () => {
    cannotOpen.add("linh@example.com");
    const c = ctx();
    await planNagMilestone(row(), c);
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(sendTransactionalEmail.mock.calls[0][0].to).toEqual(["mai@example.com"]);
  });

  // S.16.9: a manager reads the member in the third person, by the name shown.
  it("names the new hire to their manager by the shown name, not the greeting", async () => {
    await planNagMilestone(row(), ctx({ name: "Mai Trần", greeting: "Mai" }));
    expect(sendTransactionalEmail.mock.calls[0][0].subject).toBe("Onboarding plan needed before Day 1: Mai Trần");
  });

  it("stays silent before T-6 and after Day 1", async () => {
    for (const d of [-7, 1, 30]) {
      const c = ctx({ d });
      await planNagMilestone(row(), c);
      expect(sendTransactionalEmail).not.toHaveBeenCalled();
      expect(c.summary.planNags).toBe(0);
    }
  });

  it("stays silent once a plan link or an uploaded plan exists", async () => {
    await planNagMilestone(row({ plan_url: "https://docs/plan" }), ctx());
    await planNagMilestone(row({ plan_path: "plans/mai.md" }), ctx());
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("stays silent when the manager has no email to nag", async () => {
    await planNagMilestone(row(), ctx({ manager: undefined }));
    await planNagMilestone(row(), ctx({ manager: { name: "Linh", email: null } }));
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("does not count a nag the mailer refused to send", async () => {
    sendTransactionalEmail.mockResolvedValueOnce(false);
    const c = ctx();
    await planNagMilestone(row(), c);
    expect(c.summary.planNags).toBe(0);
  });
});

// The Day 8 survey went out every morning from 19 to 23 Sep 2026: the cron sent,
// then stamped, and its next read came from a cache that never showed the stamp.
// It also went to a starter who had already answered. The milestone now claims
// the stamp in the database before it sends, so the database, not the row the
// run happened to read, decides whether this is the one send.
describe("day8SurveyMilestone", () => {
  const events: string[] = [];
  const ctx = (claimed: boolean, over: Partial<MilestoneCtx> = {}): MilestoneCtx => ({
    todayISO: "2026-08-08",
    d: 8,
    start: "2026-08-01",
    probEnd: "2026-09-29",
    manager: { name: "Linh", email: "linh@example.com" },
    name: "Mai",
    greeting: "Mai",
    origin: "https://edge8.test",
    boardLink: "https://edge8.test/team/onboarding",
    alreadyFullTime: false,
    summary: { date: "2026-08-08", journeys: 1, backfilled: 0, planNags: 0, day8Sent: 0, reviewsSent: 0, decisionReminders: 0, promoted: 0, day180Sent: 0 },
    patchJourney: vi.fn(async (_id: string, patch: Record<string, unknown>) => {
      events.push(`patch ${JSON.stringify(patch)}`);
      return { ok: true as const };
    }),
    claimJourneyStamp: vi.fn(async (_id: string, column: string, unlessSet: string[] = []) => {
      events.push(`claim ${column} unless ${unlessSet.join(",")}`);
      return claimed;
    }),
    releaseJourneyStamp: vi.fn(async (_id: string, column: string) => {
      events.push(`release ${column}`);
    }),
    recruiterEmailFor: vi.fn(async () => null),
    ...over,
  });

  beforeEach(() => {
    events.length = 0;
    sendTransactionalEmail.mockClear();
    sendTransactionalEmail.mockImplementation(async (args: EmailArgs) => {
      events.push(`send ${args.subject}`);
      return true;
    });
  });

  it("claims the stamp, unless the survey was answered, before it sends", async () => {
    const c = ctx(true);
    await day8SurveyMilestone(row(), c);
    expect(events).toEqual([
      "claim day8_survey_sent_at unless day8_response_id",
      "send One week in — 3 quick questions",
    ]);
    expect(c.summary.day8Sent).toBe(1);
  });

  // Y.64: the key lets the mailer retry a lost reply without a second survey.
  it("sends under the key onboarding/day8/<journey>", async () => {
    await day8SurveyMilestone(row(), ctx(true));
    expect((sendTransactionalEmail.mock.calls[0][0] as { idempotencyKey?: string }).idempotencyKey).toBe("onboarding/day8/j1");
  });

  // S.16.9: the member's own email addresses them by the name they go by.
  it("greets the new hire by their greeting name, not the name managers see", async () => {
    await day8SurveyMilestone(row(), ctx(true, { name: "Mai Trần", greeting: "Mai" }));
    const html = sendTransactionalEmail.mock.calls[0][0].html;
    expect(html).toContain("Hi Mai,");
    expect(html).not.toContain("Mai Trần");
  });

  it("sends nothing when the claim is lost: an earlier run sent it, or they answered", async () => {
    const c = ctx(false);
    await day8SurveyMilestone(row(), c);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
    expect(c.summary.day8Sent).toBe(0);
  });

  it("never emails someone whose answer is already on the journey, and marks it handled", async () => {
    const c = ctx(true);
    await day8SurveyMilestone(row({ day8_response_id: "resp-1" }), c);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
    expect(c.claimJourneyStamp).toHaveBeenCalledWith("j1", "day8_survey_sent_at");
    expect(c.summary.day8Sent).toBe(0);
  });

  it("gives the stamp back when the mailer refuses, so tomorrow's run tries again", async () => {
    sendTransactionalEmail.mockResolvedValueOnce(false);
    const c = ctx(true);
    await day8SurveyMilestone(row(), c);
    expect(c.releaseJourneyStamp).toHaveBeenCalledWith("j1", "day8_survey_sent_at");
    expect(c.summary.day8Sent).toBe(0);
  });

  it("gives the stamp back when the mailer throws, and lets the driver count the failure", async () => {
    sendTransactionalEmail.mockRejectedValueOnce(new Error("Resend 503"));
    const c = ctx(true);
    await expect(day8SurveyMilestone(row(), c)).rejects.toThrow("Resend 503");
    expect(c.releaseJourneyStamp).toHaveBeenCalledWith("j1", "day8_survey_sent_at");
  });

  // A release that failed quietly would leave the survey marked sent for
  // someone who never got it, with no retry: the claim's own failure mode,
  // mirrored. It has to reach the driver, which counts the person as failed.
  it("fails loudly when the stamp cannot be given back", async () => {
    sendTransactionalEmail.mockResolvedValueOnce(false);
    const c = ctx(true, {
      releaseJourneyStamp: vi.fn(async () => {
        throw new Error("release failed");
      }),
    });
    await expect(day8SurveyMilestone(row(), c)).rejects.toThrow("release failed");
  });

  it("never gives the stamp back after a send that went out", async () => {
    const c = ctx(true);
    await day8SurveyMilestone(row(), c);
    expect(c.releaseJourneyStamp).not.toHaveBeenCalled();
    expect(c.patchJourney).not.toHaveBeenCalled();
  });


  it("does not send before Day 8, or to someone with no address", async () => {
    await day8SurveyMilestone(row(), ctx(true, { d: 7 }));
    await day8SurveyMilestone(row({ member: member({ email: null }) }), ctx(true));
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("past Day 30, stamps it handled without sending a 'one week in' email", async () => {
    const c = ctx(true, { d: 31 });
    await day8SurveyMilestone(row(), c);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
    expect(c.claimJourneyStamp).toHaveBeenCalledWith("j1", "day8_survey_sent_at");
  });
});

describe("releaseJourneyStamp", () => {
  beforeEach(() => {
    resetFake();
  });

  it("clears only the named stamp on the named journey", async () => {
    script("onboarding_plans", {});
    await releaseJourneyStamp("j1", "day8_survey_sent_at");
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("onboarding_plans");
    expect(calls[0].payloads[0]).toMatchObject({ day8_survey_sent_at: null });
    expect(calls[0].filters).toEqual([["eq", "id", "j1"]]);
  });

  it("raises when the write fails, instead of logging and moving on", async () => {
    script("onboarding_plans", { error: { message: "connection reset" } });
    await expect(releaseJourneyStamp("j1", "day8_survey_sent_at")).rejects.toThrow("connection reset");
  });
});

// S.16.9 review: the tests above build the context by hand, so they could not
// see what toCycleRow makes of a real row. These load one through the house
// fake: the name a manager reads is personName, the greeting the member reads
// is greetingName, and a person with no given name has no greeting at all.
describe("getAllCycleRows — who a journey names and greets", () => {
  const plan = (people: Record<string, string | null>) => ({
    id: "j1", team_member_id: "tm1", stage: "day_1",
    team_members: { id: "tm1", person_id: "p1", start_date: "2026-08-01", manager_id: null, status: "active", employment_stage: "probation", probation_ends_on: null, contract_start_date: null, people: { avatar_url: null, ...people }, positions: null },
  });

  beforeEach(() => resetFake());

  it("names a family-name-first hire by the display name and greets them by the given name", async () => {
    script("onboarding_plans", { data: [plan({ display_name: "Hiếu Nguyễn", preferred_name: null, first_name: null, full_name: "Nguyễn Văn Hiếu", email: "h@x.test" })] });
    const [r] = await getAllCycleRows();
    expect(r.member.name).toBe("Hiếu Nguyễn");
    expect(r.member.greeting).toBe("Hiếu");
  });

  it("gives a hire with no name stored no greeting, never their email or full name", async () => {
    script("onboarding_plans", { data: [plan({ display_name: null, preferred_name: "Nguyễn Văn Hiếu", first_name: null, full_name: "Nguyễn Văn Hiếu", email: "h@x.test" })] });
    const [r] = await getAllCycleRows();
    expect(r.member.name).toBe("Nguyễn Văn Hiếu");
    expect(r.member.greeting).toBeNull();
  });
});

describe("day60PromotionMilestone — the congratulations email", () => {
  const ctx = (over: Partial<MilestoneCtx> = {}): MilestoneCtx =>
    ({
      todayISO: "2026-09-30",
      d: 60,
      start: "2026-08-01",
      probEnd: "2026-09-29",
      manager: undefined,
      name: "Mai Trần",
      greeting: "Mai",
      origin: "https://edge8.test",
      boardLink: "https://edge8.test/team/onboarding",
      alreadyFullTime: false,
      summary: { promoted: 0 } as CycleRunSummary,
      patchJourney: vi.fn(async () => ({ ok: true as const })),
      claimJourneyStamp: vi.fn(async () => true),
      releaseJourneyStamp: vi.fn(async () => {}),
      recruiterEmailFor: vi.fn(async () => null),
      ...over,
    }) as MilestoneCtx;

  beforeEach(() => {
    sendTransactionalEmail.mockClear();
    teamMemberWriteError = null;
  });

  it("greets the hire by their greeting, not the name managers read", async () => {
    await day60PromotionMilestone(row({ decision: "offer_full_time" }), ctx());
    const call = sendTransactionalEmail.mock.calls[0][0];
    expect(call.subject).toBe("Congratulations Mai — you're a full-time Edge8 team member!");
    expect(call.html).toContain("<p>Hi Mai,</p>");
  });

  it("drops the name from the subject when there is no greeting, rather than \"Congratulations there\"", async () => {
    await day60PromotionMilestone(row({ decision: "offer_full_time" }), ctx({ greeting: null }));
    const call = sendTransactionalEmail.mock.calls[0][0];
    expect(call.subject).toBe("Congratulations — you're a full-time Edge8 team member!");
    expect(call.html).toContain("<p>Hi there,</p>");
  });
});

describe("decisionReminderMilestone (AC.15)", () => {
  const due = { todayISO: "2026-09-25", d: 56, probEnd: "2026-09-29" };
  const baseCtx = (over: Partial<MilestoneCtx> = {}): MilestoneCtx => ({
    todayISO: "2026-09-25",
    d: 56,
    start: "2026-08-01",
    probEnd: due.probEnd,
    manager: { name: "Linh", email: "linh@example.com" },
    name: "Mai",
    greeting: "Mai",
    origin: "https://edge8.test",
    boardLink: "https://edge8.test/team/onboarding",
    alreadyFullTime: false,
    summary: { date: "2026-09-25", journeys: 1, backfilled: 0, planNags: 0, day8Sent: 0, reviewsSent: 0, decisionReminders: 0, promoted: 0, day180Sent: 0 } as CycleRunSummary,
    patchJourney: vi.fn(async () => ({ ok: true as const })),
    claimJourneyStamp: vi.fn(async () => true),
    releaseJourneyStamp: vi.fn(async () => {}),
    recruiterEmailFor: vi.fn(async () => null),
    ...over,
  });

  beforeEach(() => {
    sendTransactionalEmail.mockClear();
    cannotOpen.clear();
  });

  it("reminds the manager and the talent inbox to record the decision", async () => {
    await decisionReminderMilestone(row(), baseCtx());
    expect(sendTransactionalEmail.mock.calls[0][0].to).toEqual(["linh@example.com", "mai@example.com"]);
  });

  it("leaves a manager who may not open the decision page off the reminder", async () => {
    cannotOpen.add("linh@example.com");
    await decisionReminderMilestone(row(), baseCtx());
    expect(sendTransactionalEmail.mock.calls[0][0].to).toEqual(["mai@example.com"]);
  });
});
