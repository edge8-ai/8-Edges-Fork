import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Admin's advances: behind its own permission, on its own links, and read-only.
const asked = vi.hoisted(() => [] as string[]);
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async (p: string) => (asked.push(p), { personId: "person-a" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/entities/reimbursements/ui/ReimbursementTabs", () => ({
  ReimbursementTabs: () => null,
  readTabsFor: async () => ({ counts: {}, may: {} }),
}));
vi.mock("@/entities/reimbursements/lib/advance-queue", () => ({
  readAdvanceQueue: async () => [{
    row: { id: "advance-1", refNo: 7, status: "approved", personId: "person-a", purpose: "Venue", amountVnd: 8_000_000, spendEndsOn: "2026-11-13", settleBy: null, submittedAt: "t", decidedBy: null, balanceVnd: null },
    ownerName: "Avery Example",
    spentVnd: null,
    returnedVnd: 0,
    claimStatus: null,
  }],
}));

import Page from "./page";

beforeEach(() => {
  asked.length = 0;
});

describe("Admin's advances", () => {
  it("asks for reimbursements.view, and its rows and tabs stay in Admin", async () => {
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    expect(asked).toEqual(["reimbursements.view"]);
    expect(html).toContain('href="/admin/finance/reimbursements/advances/advance-1"');
    expect(html).toContain('href="/admin/finance/reimbursements/advances?tab=closed"');
    expect(html).not.toContain("/team/finance");
  });

  it("offers no export: account 141 is behind paying", async () => {
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    expect(html).not.toContain("export");
  });
});
