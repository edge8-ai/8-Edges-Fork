import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { answerOnlySelectedColumns, calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// RB.4, Admin's lists: To approve asks for reimbursements.approve and lists
// checked claims but the viewer's own (unless they may decide their own); All,
// Approved and Paid ask for reimbursements.view. Every row opens Admin's claim
// page, never the Team view's, and no list reads a bank detail. Since RB.14
// each is a tab of Reimbursements: the page reads the five tab counts first.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const asked = vi.hoisted(() => [] as string[]);
const viewer = vi.hoisted(() => ({ personId: "person-employer" as string | null, holds: new Set<string>() }));
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (p: string) => (asked.push(p), { personId: viewer.personId, user: { email: "employer@example.test" }, may: (q: string) => viewer.holds.has(q) }),
}));

import ToApprovePage from "./page";
import AllPage from "../all/page";
import LandingPage from "../page";
import ApprovedPage from "../approved/page";
import PaidPage from "../paid/page";

const CLAIM = "11111111-1111-4111-8111-111111111111";
const row = (status: string) => ({
  id: CLAIM,
  title: "Hanoi workshop",
  status,
  person_id: "person-a",
  submitted_at: "2026-10-01T03:00:00Z",
  approved_total_vnd: null,
  owner: { display_name: "Avery Stone" },
});

/** The five tab counts every list page reads before its list (RB.14). */
const scriptCounts = () => script("reimbursement_claims", { count: 1 }, { count: 2 }, { count: 0 }, { count: 4 }, { count: 7 });
/** The list read: the last query of the claims table, after the counts. */
const listRead = () => calls.filter((c) => c.table === "reimbursement_claims").at(-1);

beforeEach(() => {
  resetFake();
  answerOnlySelectedColumns();
  asked.length = 0;
  viewer.personId = "person-employer";
  viewer.holds = new Set();
});

describe("/admin/finance/reimbursements/to-approve", () => {
  it("lists checked claims but the viewer's own, each opening Admin's claim page", async () => {
    scriptCounts();
    script("reimbursement_claims", { data: [row("checked")] });
    script("reimbursement_claim_items", { data: [{ claim_id: CLAIM, amount_vnd: 126000, declined_at: null }] });
    const html = renderToStaticMarkup(await ToApprovePage());
    expect(asked).toEqual(["reimbursements.approve"]);
    expect(html).toContain(`href="/admin/finance/reimbursements/${CLAIM}"`);
    expect(listRead()?.filters).toEqual([
      ["eq", "status", "checked"],
      ["neq", "person_id", "person-employer"],
    ]);
  });

  it("includes the employer's own claims, and says when nothing waits", async () => {
    viewer.holds.add("reimbursements.decide-own");
    scriptCounts();
    script("reimbursement_claims", { data: [] });
    expect(renderToStaticMarkup(await ToApprovePage())).toContain("Nothing is waiting for approval.");
    expect(listRead()?.filters).toEqual([["eq", "status", "checked"]]);
  });

  it("refuses an approver with no person record, reading nothing", async () => {
    viewer.personId = null;
    expect(renderToStaticMarkup(await ToApprovePage())).toContain("no person record");
    expect(calls).toHaveLength(0);
  });
});

describe("/admin/finance/reimbursements/to-approve, as a tab (RB.14)", () => {
  it("shows the tabs this viewer's access reaches, each with its count, the active one marked", async () => {
    viewer.holds = new Set(["reimbursements.approve", "reimbursements.view"]);
    scriptCounts();
    script("reimbursement_claims", { data: [] });
    const html = renderToStaticMarkup(await ToApprovePage());
    expect(html).not.toContain(">To check");
    expect(html).toContain('<a class="admin-tab is-active" aria-current="page" href="/admin/finance/reimbursements/to-approve">To approve<span class="admin-tab-count">2</span></a>');
    expect(html).toContain('href="/admin/finance/reimbursements/all"');
    expect(html).not.toContain("Export month");
  });
});

describe("/admin/finance/reimbursements, the landing page (RB.14)", () => {
  it("asks only for the Admin view and sends each viewer to the first tab they may open", async () => {
    const go = async () => {
      try {
        await LandingPage();
        return null;
      } catch (e) {
        return String((e as { digest?: string }).digest ?? e);
      }
    };
    viewer.holds = new Set(["reimbursements.check", "reimbursements.approve"]);
    expect(await go()).toContain("/admin/finance/reimbursements/to-check");
    viewer.holds = new Set(["reimbursements.approve", "reimbursements.view"]);
    expect(await go()).toContain("/admin/finance/reimbursements/to-approve");
    viewer.holds = new Set(["reimbursements.view"]);
    expect(await go()).toContain("/admin/finance/reimbursements/all");
    expect(asked.every((p) => p === "surface.admin")).toBe(true);
    viewer.holds = new Set();
    expect(renderToStaticMarkup(await LandingPage())).toContain("does not include checking, approving or seeing claims");
    expect(calls).toHaveLength(0);
  });
});

describe.each([
  ["/admin/finance/reimbursements/all", AllPage, "submitted"],
  ["/admin/finance/reimbursements/approved", ApprovedPage, "approved"],
  ["/admin/finance/reimbursements/paid", PaidPage, "paid"],
] as const)("%s", (_path, Page, status) => {
  it("asks for reimbursements.view and lists claims with their status, opening Admin's claim page, no bank details read", async () => {
    scriptCounts();
    script("reimbursement_claims", { data: [row(status)] });
    script("reimbursement_claim_items", { data: [{ claim_id: CLAIM, amount_vnd: 126000, declined_at: null }] });
    const html = renderToStaticMarkup(await Page());
    expect(asked).toEqual(["reimbursements.view"]);
    expect(html).toContain(`href="/admin/finance/reimbursements/${CLAIM}"`);
    expect(html).toContain("Avery Stone");
    expect(html).toContain("1 receipt<");
    expect(calls.some((c) => c.table === "people_sensitive")).toBe(false);
  });
});
