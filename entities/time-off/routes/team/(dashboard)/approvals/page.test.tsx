import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// S.5, Z.2.1. /team/approvals is the approvals inbox: every team login may open
// it (surface.team), and the rows are what the approvals reader says waits on
// them. Leave named on them is decided in its row; everything else links to
// where it is decided. Nobody is sent away for having nothing waiting.
const redirect = vi.fn((to: string) => {
  throw new Error(`redirect:${to}`);
});
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to), useRouter: () => ({ refresh() {} }) }));
vi.mock("@/kernel/identity/team-auth", () => ({ requireTeamMember: async () => ({ personId: "p-juno", role: "employee" }) }));
// The page asks for its declared permission first (ADR 0013); recorded so the
// test pins which one.
const asked: string[] = [];
const access = { permissions: () => ["surface.team", "reimbursements.check"], may: () => false, roles: [] };
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (p: string) => (asked.push(p), access),
}));
let rows: unknown[] = [];
const inboxArgs: unknown[][] = [];
vi.mock("@/kernel/approvals/inbox", () => ({ approvalsInbox: async (...args: unknown[]) => (inboxArgs.push(args), rows) }));
vi.mock("./actions", () => ({ decideLeaveRequest: async () => ({ ok: true }) }));

import TeamApprovalsPage from "./page";

const row = (over: Record<string, unknown>) => ({
  id: "ap-1",
  subjectType: "reimbursement_check",
  subjectId: "cl-1",
  subject: "Reimbursement: check",
  tier: 0,
  tierChip: "Internal",
  title: "Check claim: taxi to the client",
  askedBy: "Rowan Example",
  createdAt: new Date().toISOString(),
  namedOnMe: false,
  whose: "Your role: Finance",
  href: "/team/finance/claims/cl-1",
  cta: "Check the claim",
  facts: [{ label: "Never decided by", value: "The person who claimed it" }],
  ...over,
});

beforeEach(() => {
  redirect.mockClear();
  rows = [];
  asked.length = 0;
  inboxArgs.length = 0;
});

describe("/team/approvals", () => {
  it("opens for any team login and reads the inbox for this person on the Team view", async () => {
    const html = renderToStaticMarkup(await TeamApprovalsPage());
    expect(asked).toEqual(["surface.team"]);
    expect(inboxArgs).toEqual([["p-juno", access, { surface: "team" }]]);
    expect(redirect).not.toHaveBeenCalled();
    expect(html).toContain("Nothing is waiting here.");
    expect(html).toContain("All (0)");
    expect(html).toContain("Named on me (0)");
    expect(html).toContain("My roles (0)");
  });

  it("lists a claim check waiting on a role this person holds, linked to where it is decided, without deciding it here", async () => {
    rows = [row({})];
    const html = renderToStaticMarkup(await TeamApprovalsPage());
    expect(html).toContain("Check claim: taxi to the client");
    expect(html).toContain("Rowan Example");
    expect(html).toContain("Your role: Finance");
    expect(html).toContain('href="/team/finance/claims/cl-1"');
    expect(html).toContain("Check the claim");
    expect(html).toContain("Details");
    expect(html).not.toContain("Approve<");
    expect(html).toContain("My roles (1)");
  });

  it("decides leave named on this person in its row, with no link away", async () => {
    rows = [row({ id: "ap-2", subjectType: "time_off", subjectId: "lv-1", subject: "Leave request", title: "Rowan · Annual · Oct 1", namedOnMe: true, whose: "You", href: "/admin/operations/time-off/requests", cta: "Open the leave requests" })];
    const html = renderToStaticMarkup(await TeamApprovalsPage());
    expect(html).toContain("Rowan · Annual · Oct 1");
    expect(html).toContain("Approve");
    expect(html).toContain("Decline");
    expect(html).not.toContain("/admin/operations/time-off/requests");
    expect(html).toContain("Named on me (1)");
  });

  it("links leave waiting on the admins to the admin board instead of offering a decision the action would refuse", async () => {
    rows = [row({ subjectType: "time_off", namedOnMe: false, whose: "Your role: Admin", href: "/admin/operations/time-off/requests", cta: "Open the leave requests" })];
    const html = renderToStaticMarkup(await TeamApprovalsPage());
    expect(html).toContain('href="/admin/operations/time-off/requests"');
    expect(html).not.toContain("Decline");
  });

  it("lists a row with no page the viewer may open, without a link", async () => {
    rows = [row({ href: null })];
    const html = renderToStaticMarkup(await TeamApprovalsPage());
    expect(html).toContain("Check claim: taxi to the client");
    expect(html).not.toContain("Check the claim");
  });
});
