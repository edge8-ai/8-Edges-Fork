import { beforeEach, describe, expect, it, vi } from "vitest";

// Day 45, Day 60 and Day 180 claim their stamp in the database before they act,
// the way Day 8 has since #1628. On 24 and 25 Sep 2026 the cron read a cached
// row that still showed the hire on probation and unpromoted, so it promoted
// them again and sent the congratulations email, with its CC, a second time.
// The claim asks the database instead of trusting the row the run read, so a
// stale read, a retry or a manual run finds the stamp taken and does nothing.

type EmailArgs = { to: string | string[]; subject: string; html: string };
const events: string[] = [];
const sendTransactionalEmail = vi.fn(async (args: EmailArgs) => {
  events.push(`send ${args.subject}`);
  return true;
});
vi.mock("@/kernel/messaging/email", () => ({
  sendTransactionalEmail: (args: EmailArgs) => sendTransactionalEmail(args),
}));
// AC.15: a manager is mailed a link only when they may open the page it points
// at. A test names the addresses that may not.
const cannotOpen = vi.hoisted(() => new Set<string>());
vi.mock("@/kernel/identity/may-open", () => ({
  emailsWhoMayOpen: vi.fn(async (emails: string[]) => emails.filter((e) => !cannotOpen.has(e))),
}));
vi.mock("@/kernel/audit/audit", () => ({
  recordAudit: vi.fn(async (a: { context: { action: string } }) => {
    events.push(`audit ${a.context.action}`);
  }),
}));
let teamMemberWriteError: { message: string } | null = null;
vi.mock("@/kernel/identity/writes", () => ({
  updateTeamMembers: (patch: Record<string, unknown>) => ({
    eq: async () => {
      events.push(`team_members ${JSON.stringify(patch)}`);
      return { error: teamMemberWriteError };
    },
  }),
}));

import type { CycleRow, CycleRunSummary } from "./cycle";
import { day180StayMilestone, day45ReviewMilestone, day60PromotionMilestone, type MilestoneCtx } from "./milestones";

const row = (over: Partial<CycleRow> = {}): CycleRow =>
  ({
    id: "j1",
    team_member_id: "tm1",
    stage: "day_45",
    plan_url: null,
    plan_path: null,
    plan_uploaded_at: null,
    day8_survey_sent_at: "2026-08-08T00:30:00Z",
    day8_response_id: null,
    day45_email_sent_at: null,
    decision: null,
    decision_at: null,
    day60_promoted_at: null,
    day180_email_sent_at: null,
    completed_at: null,
    member: {
      personId: "p1",
      name: "Mai Trần",
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
    },
    ...over,
  }) as CycleRow;

const summary = (): CycleRunSummary => ({
  date: "2026-09-30",
  journeys: 1,
  backfilled: 0,
  planNags: 0,
  day8Sent: 0,
  reviewsSent: 0,
  decisionReminders: 0,
  promoted: 0,
  day180Sent: 0,
});

const ctx = (claimed: boolean, over: Partial<MilestoneCtx> = {}): MilestoneCtx => ({
  todayISO: "2026-09-30",
  d: 61,
  start: "2026-08-01",
  probEnd: "2026-09-29",
  manager: { name: "Linh", email: "linh@example.com" },
  name: "Mai Trần",
  greeting: "Mai",
  origin: "https://edge8.test",
  boardLink: "https://edge8.test/team/onboarding",
  alreadyFullTime: false,
  summary: summary(),
  patchJourney: vi.fn(async (_id: string, patch: Record<string, unknown>) => {
    events.push(`patch ${Object.keys(patch).sort().join(",")}`);
    return { ok: true as const };
  }),
  claimJourneyStamp: vi.fn(async (_id: string, column: string, unlessSet: string[] = []) => {
    events.push(`claim ${column}${unlessSet.length ? ` unless ${unlessSet.join(",")}` : ""}`);
    return claimed;
  }),
  releaseJourneyStamp: vi.fn(async (_id: string, column: string) => {
    events.push(`release ${column}`);
  }),
  recruiterEmailFor: vi.fn(async () => "recruiter@example.com"),
  ...over,
});

beforeEach(() => {
  cannotOpen.clear();
  events.length = 0;
  teamMemberWriteError = null;
  sendTransactionalEmail.mockClear();
});

describe("day45ReviewMilestone claims before it emails the manager", () => {
  // Due 15 days before probation ends: 2026-09-14 on a 29 Sep end.
  const due = { todayISO: "2026-09-14", d: 45 };

  it("claims the stamp, unless a decision or promotion is on file, then sends", async () => {
    const c = ctx(true, due);
    await day45ReviewMilestone(row(), c);
    expect(events).toEqual([
      "claim day45_email_sent_at unless decision,day60_promoted_at",
      `send Probation review due: Mai Trần`,
    ]);
    expect(c.summary.reviewsSent).toBe(1);
    expect(c.patchJourney).not.toHaveBeenCalled();
  });

  it("sends nothing, and takes no stamp, to a manager who may not open the decision page (AC.15)", async () => {
    cannotOpen.add("linh@example.com");
    const c = ctx(true, due);
    await day45ReviewMilestone(row(), c);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
    expect(c.claimJourneyStamp).not.toHaveBeenCalled();
    expect(c.summary.reviewsSent).toBe(0);
  });

  it("sends nothing when the claim is lost, even on a row that looks unsent", async () => {
    const c = ctx(false, due);
    await day45ReviewMilestone(row(), c);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
    expect(c.summary.reviewsSent).toBe(0);
  });

  it("gives the stamp back when the mailer refuses, so tomorrow's run tries again", async () => {
    sendTransactionalEmail.mockResolvedValueOnce(false);
    const c = ctx(true, due);
    await day45ReviewMilestone(row(), c);
    expect(c.releaseJourneyStamp).toHaveBeenCalledWith("j1", "day45_email_sent_at");
    expect(c.summary.reviewsSent).toBe(0);
  });

  it("gives the stamp back when the mailer throws, and lets the driver count it", async () => {
    sendTransactionalEmail.mockRejectedValueOnce(new Error("Resend 503"));
    const c = ctx(true, due);
    await expect(day45ReviewMilestone(row(), c)).rejects.toThrow("Resend 503");
    expect(c.releaseJourneyStamp).toHaveBeenCalledWith("j1", "day45_email_sent_at");
  });

  it("does not claim before the review window opens", async () => {
    const c = ctx(true, { todayISO: "2026-09-13", d: 44 });
    await day45ReviewMilestone(row(), c);
    expect(c.claimJourneyStamp).not.toHaveBeenCalled();
  });
});

describe("day60PromotionMilestone claims before it promotes", () => {
  const decided = () => row({ decision: "offer_full_time" });

  it("claims the stamp first, then promotes, audits and congratulates", async () => {
    const c = ctx(true);
    await day60PromotionMilestone(decided(), c);
    expect(events).toEqual([
      "claim day60_promoted_at",
      'team_members {"employment_stage":"full_time"}',
      "audit day60_promotion",
      "send Congratulations Mai — you're a full-time Edge8 team member!",
    ]);
    expect(c.summary.promoted).toBe(1);
    expect(c.patchJourney).not.toHaveBeenCalled();
  });

  // The 25 Sep 2026 run: the row it read was cached from before the 24 Sep
  // promotion, so it still said probation and unpromoted. The database had the
  // stamp, so the claim is lost and nothing happens a second time.
  it("does nothing on a stale row once the database holds the stamp", async () => {
    const c = ctx(false);
    await day60PromotionMilestone(decided(), c);
    expect(events).toEqual(["claim day60_promoted_at"]);
    expect(c.summary.promoted).toBe(0);
  });

  it("gives the stamp back and raises when the promotion write fails", async () => {
    teamMemberWriteError = { message: "permission denied" };
    const c = ctx(true);
    await expect(day60PromotionMilestone(decided(), c)).rejects.toThrow("permission denied");
    expect(c.releaseJourneyStamp).toHaveBeenCalledWith("j1", "day60_promoted_at");
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  // The promotion is the milestone; the email is a courtesy on top. Releasing
  // the stamp after a failed email would promote them again tomorrow.
  it("keeps the stamp when only the congratulations email fails", async () => {
    sendTransactionalEmail.mockResolvedValueOnce(false);
    const c = ctx(true);
    await day60PromotionMilestone(decided(), c);
    expect(c.releaseJourneyStamp).not.toHaveBeenCalled();
    expect(c.summary.promoted).toBe(1);
  });

  it("stamps someone already full time quietly, through the claim", async () => {
    const c = ctx(true, { alreadyFullTime: true });
    await day60PromotionMilestone(row(), c);
    expect(events).toEqual(["claim day60_promoted_at"]);
  });

  it("waits for probation to end and for the manager's decision", async () => {
    await day60PromotionMilestone(decided(), ctx(true, { todayISO: "2026-09-28" }));
    await day60PromotionMilestone(row(), ctx(true));
    expect(events).toEqual([]);
  });
});

describe("day180StayMilestone claims before it prompts the stay interview", () => {
  const at180 = { d: 180 };

  it("claims the stamp, sends, then closes the journey", async () => {
    const c = ctx(true, at180);
    expect(await day180StayMilestone(row(), c)).toBe(true);
    expect(events).toEqual([
      "claim day180_email_sent_at",
      "send 180-day stay interview: Mai Trần",
      "patch completed_at,stage",
    ]);
    expect(c.summary.day180Sent).toBe(1);
  });

  it("sends nothing and keeps the journey open when the claim is lost", async () => {
    const c = ctx(false, at180);
    expect(await day180StayMilestone(row(), c)).toBe(false);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("gives the stamp back when the mailer refuses", async () => {
    sendTransactionalEmail.mockResolvedValueOnce(false);
    const c = ctx(true, at180);
    expect(await day180StayMilestone(row(), c)).toBe(false);
    expect(c.releaseJourneyStamp).toHaveBeenCalledWith("j1", "day180_email_sent_at");
    expect(c.patchJourney).not.toHaveBeenCalled();
  });

  it("gives the stamp back when the mailer throws", async () => {
    sendTransactionalEmail.mockRejectedValueOnce(new Error("Resend 503"));
    const c = ctx(true, at180);
    await expect(day180StayMilestone(row(), c)).rejects.toThrow("Resend 503");
    expect(c.releaseJourneyStamp).toHaveBeenCalledWith("j1", "day180_email_sent_at");
  });
});

// Y.64. A claim stops a second run, but not a lost Resend reply: the send
// throws, the stamp is handed back, and tomorrow's run sends again. Each
// once-only email carries a key naming the milestone and the journey, so the
// mailer's one retry inside Resend's 24-hour window cannot send it twice.
describe("once-only emails carry an idempotency key per milestone and journey", () => {
  const keyOf = (i = 0) => (sendTransactionalEmail.mock.calls[i][0] as { idempotencyKey?: string }).idempotencyKey;

  it("Day 45 sends under onboarding/day45/<journey>", async () => {
    await day45ReviewMilestone(row(), ctx(true, { todayISO: "2026-09-14", d: 45 }));
    expect(keyOf()).toBe("onboarding/day45/j1");
  });

  it("Day 60's congratulations sends under onboarding/day60/<journey>", async () => {
    await day60PromotionMilestone(row({ decision: "offer_full_time" }), ctx(true));
    expect(keyOf()).toBe("onboarding/day60/j1");
  });

  it("Day 180 sends under onboarding/day180/<journey>", async () => {
    await day180StayMilestone(row({ id: "j2" }), ctx(true, { d: 180 }));
    expect(keyOf()).toBe("onboarding/day180/j2");
  });
});
