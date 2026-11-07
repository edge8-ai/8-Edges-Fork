import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Finance's paper: guarded on paying, unscoped, and only a paper the advance has yet.
const asked = vi.hoisted(() => [] as string[]);
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async (p: string) => void asked.push(p) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const read = vi.hoisted(() => ({ answer: null as unknown, scopes: [] as unknown[] }));
vi.mock("@/entities/reimbursements/lib/advance-queue", () => ({
  readAdvanceForForm: async (_id: string, scope: unknown) => (read.scopes.push(scope), read.answer),
}));

import Page from "./page";

const ID = "22222222-2222-4222-8222-222222222222";
const facts = { refNo: 7, owner: "Avery Example", purpose: "Venue deposit", amountVnd: 8_000_000, settleBy: "2026-11-30", company: { name: null, taxCode: null }, asked: { at: "2026-11-03T02:30:00Z" }, approved: null, settlementApproved: { by: "Blair Example", at: "2026-11-16T03:00:00Z" }, checkApproved: null, returnRecorded: null, ownerSent: { at: "2026-11-14T01:00:00Z" }, closedOn: "2026-11-16", spentVnd: 8_720_000, items: [{ label: "Extra AV", vnd: 720_000 }] };
const render = async (kind: string) => renderToStaticMarkup(await Page({ params: Promise.resolve({ id: ID, kind }) }));

beforeEach(() => {
  asked.length = 0;
  read.scopes.length = 0;
  read.answer = { row: { status: "settled", submittedAt: "t" }, spentVnd: 8_720_000, facts };
});

describe("Finance's paper", () => {
  it("asks for reimbursements.pay and reads any advance", async () => {
    await render("04");
    expect(asked).toEqual(["reimbursements.pay"]);
    expect(read.scopes).toEqual([{}]);
  });

  it("prints what was overspent, each receipt, and who settled it", async () => {
    const html = await render("04");
    expect(html).toContain("8.720.000");
    expect(html).toContain("Extra AV");
    expect(html).toContain("720.000");
    expect(html).toContain("Approved · Blair Example · 10:00, Nov 16, 2026");
  });

  it("answers not found for one that is not there", async () => {
    read.answer = null;
    await expect(render("03")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
