// The Admin Home asks a source only when the reader may open the page that
// shows it (AH.2). Who is away names colleagues and their leave dates, so a
// reader with Admin view but not People and Time off (a hiring approver) must
// never cause that read: Home would otherwise be a side door to the team's
// leave, which that role sees nowhere else (boundary review on PR #2440).
// And the reader's own queue is asked by their own team member id only (AH.3).
//
// Every door is stubbed; mayOpen and the ids handed to the doors are what is
// under test.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestAccess } from "@/kernel/identity/access-request";

const opens = vi.hoisted(() => ({ pages: new Set<string>() }));
const timeOff = vi.hoisted(() => ({ whoIsOutBetween: vi.fn(), upcomingHolidays: vi.fn() }));
const identity = vi.hoisted(() => ({ teamSelfOf: vi.fn() }));
const reviews = vi.hoisted(() => ({ REVIEW_TYPE_LABEL: {}, reviewFormHref: vi.fn(), reviewsToWrite: vi.fn() }));
const coaching = vi.hoisted(() => ({ isOpenCommitment: vi.fn(), promisesMadeAsCoach: vi.fn() }));

vi.mock("@/kernel/identity/may-open", () => ({ mayOpen: (_access: unknown, href: string) => opens.pages.has(href) }));
vi.mock("@/kernel/identity/team-people", () => identity);
vi.mock("@/entities/time-off", () => timeOff);
vi.mock("@/entities/boards", () => ({ myWeek: vi.fn(), myWeekFocus: vi.fn(), readMyWeek: vi.fn(), sprintStartOf: vi.fn(), weekLabel: vi.fn() }));
vi.mock("@/entities/coaching", () => coaching);
vi.mock("@/entities/crm", () => ({ ownedDealsWithNextStepBy: vi.fn(), pipelineStageNames: vi.fn() }));
vi.mock("@/entities/hiring", () => ({ activeApplicationDates: async () => ({ data: [], error: null }) }));
// The reviews moved to org with their table (ADR 0025).
vi.mock("@/entities/org", () => ({ getOfficeGoals: vi.fn(), getProbationRows: async () => [], ...reviews }));
vi.mock("./company-vitals-read", () => ({ readVitalsRows: vi.fn() }));
vi.mock("./waiting-approvals", () => ({ waitingApprovals: async () => [] }));

const { readAdminHome } = await import("./home-read");

const PEOPLE = "/admin/talent/team";
const TIME_OFF = "/admin/operations/time-off";

// No person record, so the reader's own queue (cards, reviews, promises,
// deals) is never asked and only the page-gated company reads remain.
const noPerson = { personId: null } as unknown as RequestAccess;

beforeEach(() => {
  opens.pages = new Set();
  timeOff.whoIsOutBetween.mockReset().mockResolvedValue([{ personId: "p1", name: "Dana Example", start: "2026-10-30", end: "2026-10-30" }]);
  timeOff.upcomingHolidays.mockReset().mockResolvedValue([]);
  identity.teamSelfOf.mockReset();
  reviews.reviewsToWrite.mockReset().mockResolvedValue([]);
  coaching.promisesMadeAsCoach.mockReset().mockResolvedValue([]);
});

describe("readAdminHome: who is away", () => {
  it("is never read for a reader with Admin view but not People, such as a hiring approver", async () => {
    opens.pages = new Set(["/admin/talent/applications"]);
    const input = await readAdminHome(noPerson, "approver@example.test");
    expect(timeOff.whoIsOutBetween).not.toHaveBeenCalled();
    expect(timeOff.upcomingHolidays).not.toHaveBeenCalled();
    expect(input.team?.away).toBeUndefined();
    expect(input.team?.holidays).toBeUndefined();
    expect(input.team?.applications).toEqual({ ok: true, value: { count: 0, newest: null, href: "/admin/talent/applications" } });
  });

  it.each([
    ["People without Time off", [PEOPLE]],
    ["Time off without People", [TIME_OFF]],
  ])("is never read for a reader who may open %s", async (_label, pages) => {
    opens.pages = new Set(pages);
    const input = await readAdminHome(noPerson, "half@example.test");
    expect(timeOff.whoIsOutBetween).not.toHaveBeenCalled();
    expect(timeOff.upcomingHolidays).not.toHaveBeenCalled();
    expect(input.team?.away).toBeUndefined();
    expect(input.team?.holidays).toBeUndefined();
  });

  it("is read for a reader who may open People and Time off, as an admin may", async () => {
    opens.pages = new Set([PEOPLE, TIME_OFF]);
    const input = await readAdminHome(noPerson, "admin@example.test");
    expect(timeOff.whoIsOutBetween).toHaveBeenCalledOnce();
    expect(input.team?.away).toEqual({ ok: true, value: [{ personId: "p1", name: "Dana Example", start: "2026-10-30", end: "2026-10-30" }] });
    expect(input.team?.holidays).toEqual({ ok: true, value: [] });
  });
});

describe("readAdminHome: the reader's own queue", () => {
  it("asks for reviews and 1-1 promises with exactly the reader's own team member id", async () => {
    identity.teamSelfOf.mockResolvedValue({ teamMemberId: "tm-viewer", greeting: "Dana" });
    opens.pages = new Set(["/team/coaching"]);
    const viewer = { personId: "person-viewer" } as unknown as RequestAccess;
    const input = await readAdminHome(viewer, "viewer@example.test");
    expect(identity.teamSelfOf.mock.calls).toEqual([["person-viewer"]]);
    expect(reviews.reviewsToWrite.mock.calls).toEqual([["tm-viewer"]]);
    expect(coaching.promisesMadeAsCoach.mock.calls).toEqual([["tm-viewer"]]);
    expect(input.addressedAs).toBe("Dana");
  });
});
