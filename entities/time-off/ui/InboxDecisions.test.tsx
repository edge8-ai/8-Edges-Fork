import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// TH.11 (formerly the /team/approvals page, S.5 and Z.2.1). The team Inbox's
// Decisions lists what the approvals reader says waits on the person, read on
// the Team view: leave named on them is decided in its row; everything else
// links to where it is decided; a row with no page they may open has no link;
// and each row says how far it reaches in plain words, not tiers.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock("next/link", () => ({ default: ({ href, className, children }: { href: string; className?: string; children: unknown }) => <a href={href} className={className}>{children as never}</a> }));
let rows: unknown[] = [];
const inboxArgs: unknown[][] = [];
vi.mock("@/kernel/approvals/inbox", () => ({ approvalsInbox: async (...args: unknown[]) => (inboxArgs.push(args), rows) }));
vi.mock("../lib/leave-decision-actions", () => ({ decideLeaveRequest: async () => ({ ok: true }) }));

import { inboxDecisions } from "./InboxDecisions";

const viewer = { permissions: () => ["surface.team", "reimbursements.check"], may: () => false, roles: [] };
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
const render = async () => {
  const out = await inboxDecisions({ personId: "p-juno", viewer });
  return { count: out.count, html: renderToStaticMarkup(<>{out.node}</>) };
};

beforeEach(() => {
  rows = [];
  inboxArgs.length = 0;
});

describe("inboxDecisions", () => {
  it("reads the approvals for this person on the Team view, and says when nothing waits", async () => {
    const { count, html } = await render();
    expect(inboxArgs).toEqual([["p-juno", viewer, { surface: "team" }]]);
    expect(count).toBe(0);
    expect(html).toContain("No decisions are waiting on you.");
  });

  it("lists a claim check waiting on a role this person holds, linked to where it is decided, without deciding it here", async () => {
    rows = [row({})];
    const { count, html } = await render();
    expect(count).toBe(1);
    expect(html).toContain("Check claim: taxi to the client");
    expect(html).toContain("Rowan Example");
    expect(html).toContain("Your role: Finance");
    expect(html).toContain('href="/team/finance/claims/cl-1"');
    expect(html).toContain("Check the claim");
    expect(html).toContain("Details");
    expect(html).not.toContain("Approve<");
  });

  it("decides leave named on this person in its row, with no link away", async () => {
    rows = [row({ id: "ap-2", subjectType: "time_off", subjectId: "lv-1", subject: "Leave request", title: "Rowan · Annual · Oct 1", namedOnMe: true, whose: "You", href: "/admin/operations/time-off/requests", cta: "Open the leave requests" })];
    const { html } = await render();
    expect(html).toContain("Rowan · Annual · Oct 1");
    expect(html).toContain("Approve");
    expect(html).toContain("Decline");
    expect(html).not.toContain("/admin/operations/time-off/requests");
  });

  it("links leave waiting on the admins to the admin board instead of offering a decision the action would refuse", async () => {
    rows = [row({ subjectType: "time_off", namedOnMe: false, whose: "Your role: Admin", href: "/admin/operations/time-off/requests", cta: "Open the leave requests" })];
    const { html } = await render();
    expect(html).toContain('href="/admin/operations/time-off/requests"');
    expect(html).not.toContain("Decline");
  });

  it("lists a row with no page the viewer may open, without a link", async () => {
    rows = [row({ href: null })];
    const { html } = await render();
    expect(html).toContain("Check claim: taxi to the client");
    expect(html).not.toContain("Check the claim");
  });

  it("says how far a decision reaches in plain words, never as a tier", async () => {
    rows = [row({ id: "a", tier: 0 }), row({ id: "b", tier: 1 }), row({ id: "c", tier: 2 })];
    const { html } = await render();
    expect(html).toContain("Internal");
    expect(html).toContain("Goes to one outside person");
    expect(html).toContain("Public or a commitment");
    expect(html).not.toContain("Tier ");
  });
});
