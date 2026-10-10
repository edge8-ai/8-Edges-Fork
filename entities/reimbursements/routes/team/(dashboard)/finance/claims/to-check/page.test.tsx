import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { answerOnlySelectedColumns, calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// RB.3.3, the checker's way in: the Team view's To check (the only one a
// contractor in Finance reaches) and the Admin view's. Both ask for
// reimbursements.check first, list every submitted claim but the viewer's own
// through the real queue read and the real CheckQueue, and refuse a checker
// with no person record the same way, reading nothing: without a person id
// the viewer's own claims cannot be left out.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const asked = vi.hoisted(() => [] as string[]);
const viewer = vi.hoisted(() => ({ personId: "person-finance" as string | null }));
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (p: string) => (asked.push(p), { personId: viewer.personId, user: { email: "finance@example.test" }, may: () => false }),
}));

import TeamToCheckPage from "./page";
import AdminToCheckPage from "../../../../../admin/(dashboard)/finance/reimbursements/to-check/page";

const PAGES = [
  ["/team/finance/claims/to-check", TeamToCheckPage, "/team/finance/claims"],
  ["/admin/finance/reimbursements/to-check", AdminToCheckPage, "/admin/finance/reimbursements"],
] as const;

const CLAIM = "11111111-1111-4111-8111-111111111111";

/** Admin's To check is a tab of Reimbursements (RB.14): it reads the five tab counts before its list. */
const scriptCounts = (claimPages: string) => {
  if (claimPages.startsWith("/admin")) script("reimbursement_claims", { count: 1 }, { count: 0 }, { count: 0 }, { count: 0 }, { count: 1 });
};
const listRead = () => calls.filter((c) => c.table === "reimbursement_claims").at(-1);

beforeEach(() => {
  resetFake();
  answerOnlySelectedColumns();
  asked.length = 0;
  viewer.personId = "person-finance";
});

describe.each(PAGES)("%s", (_path, Page, claimPages) => {
  it("lists the claims waiting to be checked, the viewer's own left out, each opening the claim on the same surface", async () => {
    scriptCounts(claimPages);
    script("reimbursement_claims", {
      data: [{ id: CLAIM, title: "Hanoi workshop", person_id: "person-a", submitted_at: "2026-10-01T03:00:00Z", owner: { display_name: "Avery Stone" } }],
    });
    script("reimbursement_claim_items", { data: [{ claim_id: CLAIM, amount_vnd: 126000, declined_at: null }] });
    const html = renderToStaticMarkup(await Page());
    expect(asked).toEqual(["reimbursements.check"]);
    expect(html).toContain(`href="${claimPages}/${CLAIM}"`);
    expect(html).toContain("Hanoi workshop");
    expect(html).toContain("Avery Stone");
    expect(html).toContain("1 receipt<");
    expect(listRead()?.filters).toEqual(expect.arrayContaining([["eq", "status", "submitted"], ["neq", "person_id", "person-finance"]]));
  });

  it("says nothing waits when the queue is empty", async () => {
    scriptCounts(claimPages);
    script("reimbursement_claims", { data: [] });
    expect(renderToStaticMarkup(await Page())).toContain("Nothing is waiting to be checked.");
  });

  it("refuses a checker with no person record, reading nothing", async () => {
    viewer.personId = null;
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("Your sign-in has no person record, so you cannot work on claims here.");
    expect(calls).toHaveLength(0);
  });
});
