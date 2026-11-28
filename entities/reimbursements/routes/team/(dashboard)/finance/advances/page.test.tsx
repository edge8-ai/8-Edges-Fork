import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Finance's queue. The card's promise: every advance in every state is on it, sent back
// included, and each tab holds what its label says.
const asked = vi.hoisted(() => [] as string[]);
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (p: string) => void asked.push(p),
}));
const read = vi.hoisted(() => ({ queue: [] as unknown[] }));
vi.mock("@/entities/reimbursements/lib/advance-queue", () => ({ readAdvanceQueue: async () => read.queue }));

import AdvancesQueuePage from "./page";

const queued = (status: string, n: number, over: Record<string, unknown> = {}, more: Record<string, unknown> = {}) => ({
  row: { id: `advance-${n}`, refNo: n, status, personId: "person-a", purpose: `Purpose ${n}`, amountVnd: 1_000_000, spendEndsOn: "2026-11-13", settleBy: null, submittedAt: "t", decidedBy: null, balanceVnd: null, ...over },
  ownerName: `Person ${n}`,
  spentVnd: null,
  returnedVnd: 0,
  claimStatus: null,
  ...more,
});

const render = async (tab?: string | string[]) => renderToStaticMarkup(await AdvancesQueuePage({ searchParams: Promise.resolve({ tab }) }));

beforeEach(() => {
  asked.length = 0;
  read.queue = [];
});

describe("the queue", () => {
  it("asks for reimbursements.pay", async () => {
    await render();
    expect(asked).toEqual(["reimbursements.pay"]);
  });

  it("offers account 141 for this month and the last", async () => {
    const html = await render();
    expect(html.match(/advances\/export\?month=\d{4}-\d{2}/g)).toHaveLength(2);
  });

  it("says when a tab is empty", async () => {
    expect(await render()).toContain("Nothing here.");
  });

  it("opens on what there is to transfer, and falls back there for a tab that does not exist", async () => {
    read.queue = [queued("approved", 1), queued("sent_back", 2)];
    for (const html of [await render(), await render("everything"), await render(["pay", "closed"])]) {
      expect(html).toContain("Person 1");
      expect(html).not.toContain("Person 2");
    }
  });

  it("finds every status under one tab or another, sent back included", async () => {
    const all = ["draft", "submitted", "sent_back", "rejected", "cancelled", "approved", "paid_out", "to_return", "settled"];
    read.queue = all.map((status, i) => queued(status, i + 1, status === "to_return" ? { balanceVnd: -1 } : {}));
    let joined = "";
    for (const tab of ["pay", "out", "settle", "back", "before", "closed"]) joined += await render(tab);
    all.forEach((_, i) => expect(joined).toContain(`>Person ${i + 1}<`));
  });

  it("counts each tab, and links each row to its page", async () => {
    read.queue = [queued("approved", 1), queued("approved", 2)];
    const html = await render("pay");
    expect(html).toMatch(/To transfer<span class="admin-tab-count">2</);
    expect(html).toContain('href="/team/finance/advances/advance-1"');
  });

  it("marks one held past its date, in its own tab", async () => {
    read.queue = [queued("paid_out", 1, { settleBy: "2020-01-01" })];
    const html = await render("out");
    expect(html).toContain("Overdue");
    expect(html).not.toContain("Money with you");
  });

  it("flags an advance closed ahead of its settlement, so the gap is never silent", async () => {
    read.queue = [queued("settled", 3, { balanceVnd: 0 }, { spentVnd: 1_000_000, claimStatus: "checked" })];
    expect(await render()).toContain("ADV-0003 closed, but its settlement did not finish moving");
    read.queue = [queued("settled", 3, { balanceVnd: 0 }, { spentVnd: 1_000_000, claimStatus: "settled" })];
    expect(await render()).not.toContain("did not finish moving");
  });

  it("moves one being settled to the settlements", async () => {
    read.queue = [queued("paid_out", 1, { settleBy: "2020-01-01" }, { claimStatus: "submitted" })];
    expect(await render("out")).not.toContain("Person 1");
    const html = await render("settle");
    expect(html).toContain("Person 1");
    expect(html).toContain("Settling");
  });
});
