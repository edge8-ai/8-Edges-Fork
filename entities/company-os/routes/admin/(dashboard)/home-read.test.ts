// The Admin Home asks a source only when the reader may open the page that
// shows it (AH.2). Who is away names colleagues and their leave dates, so a
// reader with Admin view but not People (a hiring approver) must never cause
// that read: Home would otherwise be a side door to the team's leave, which
// that role sees nowhere else (boundary review on PR #2440).
//
// Every door is stubbed; mayOpen is the one decision under test.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestAccess } from "@/kernel/identity/access-request";

const opens = vi.hoisted(() => ({ pages: new Set<string>() }));
const timeOff = vi.hoisted(() => ({ whoIsOutBetween: vi.fn(), upcomingHolidays: vi.fn() }));

vi.mock("@/kernel/identity/may-open", () => ({ mayOpen: (_access: unknown, href: string) => opens.pages.has(href) }));
vi.mock("@/kernel/identity/team-people", () => ({ teamSelfOf: vi.fn() }));
vi.mock("@/entities/time-off", () => timeOff);
vi.mock("@/entities/boards", () => ({ myWeek: vi.fn(), myWeekFocus: vi.fn(), readMyWeek: vi.fn(), sprintStartOf: vi.fn(), weekLabel: vi.fn() }));
vi.mock("@/entities/coaching", () => ({ isOpenCommitment: vi.fn(), promisesMadeAsCoach: vi.fn() }));
vi.mock("@/entities/crm", () => ({ ownedDealsWithNextStepBy: vi.fn(), pipelineStageNames: vi.fn() }));
vi.mock("@/entities/hiring", () => ({ activeApplicationDates: async () => ({ data: [], error: null }) }));
vi.mock("@/entities/org", () => ({ getOfficeGoals: vi.fn(), getProbationRows: async () => [] }));
vi.mock("@/entities/team", () => ({ REVIEW_TYPE_LABEL: {}, reviewFormHref: vi.fn(), reviewsToWrite: vi.fn() }));
vi.mock("./company-vitals-read", () => ({ readVitalsRows: vi.fn() }));
vi.mock("./waiting-approvals", () => ({ waitingApprovals: async () => [] }));

const { readAdminHome } = await import("./home-read");

// No person record, so the reader's own queue (cards, reviews, promises,
// deals) is never asked and only the page-gated company reads remain.
const access = { personId: null } as unknown as RequestAccess;

beforeEach(() => {
  opens.pages = new Set();
  timeOff.whoIsOutBetween.mockReset().mockResolvedValue([{ personId: "p1", name: "Dana Example", start: "2026-10-30", end: "2026-10-30" }]);
  timeOff.upcomingHolidays.mockReset().mockResolvedValue([]);
});

describe("readAdminHome: who is away", () => {
  it("is never read for a reader with Admin view but not People, such as a hiring approver", async () => {
    opens.pages = new Set(["/admin/talent/applications"]);
    const input = await readAdminHome(access, "approver@example.test");
    expect(timeOff.whoIsOutBetween).not.toHaveBeenCalled();
    expect(timeOff.upcomingHolidays).not.toHaveBeenCalled();
    expect(input.team?.away).toBeUndefined();
    expect(input.team?.holidays).toBeUndefined();
    expect(input.team?.applications).toEqual({ ok: true, value: { count: 0, newest: null, href: "/admin/talent/applications" } });
  });

  it("is read for a reader who may open People, as an admin may", async () => {
    opens.pages = new Set(["/admin/talent/team"]);
    const input = await readAdminHome(access, "admin@example.test");
    expect(timeOff.whoIsOutBetween).toHaveBeenCalledOnce();
    expect(input.team?.away).toEqual({ ok: true, value: [{ personId: "p1", name: "Dana Example", start: "2026-10-30", end: "2026-10-30" }] });
    expect(input.team?.holidays).toEqual({ ok: true, value: [] });
  });
});
