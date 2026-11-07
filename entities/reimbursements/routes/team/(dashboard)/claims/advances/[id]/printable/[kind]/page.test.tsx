import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The owner's paper: narrowed to them in the query, and only a paper the advance has yet.
const asked = vi.hoisted(() => [] as string[]);
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async (p: string) => void asked.push(p) }));
vi.mock("@/kernel/identity/team-auth", () => ({ requireTeamMember: async () => ({ personId: "person-a" }) }));
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
const facts = { refNo: 7, owner: "Avery Example", purpose: "Venue deposit", amountVnd: 8_000_000, settleBy: "2026-11-30", company: { name: "Example Co", taxCode: "0000000000" }, asked: { at: "2026-11-03T02:30:00Z" }, approved: { by: "Dana Example", at: "2026-11-03T07:05:00Z" }, settlementApproved: null, checkApproved: null, returnRecorded: null, ownerSent: null, closedOn: null, spentVnd: null, items: [] };
const answer = (over: Record<string, unknown> = {}, spentVnd: number | null = null) => ({ row: { status: "paid_out", submittedAt: "t", ...over }, spentVnd, facts: { ...facts, spentVnd } });
const render = async (kind: string, id = ID) => renderToStaticMarkup(await Page({ params: Promise.resolve({ id, kind }) }));

beforeEach(() => {
  asked.length = 0;
  read.scopes.length = 0;
  read.answer = answer();
});

describe("the owner's paper", () => {
  it("asks for the permission and reads it narrowed to them", async () => {
    await render("03");
    expect(asked).toEqual(["reimbursements.mine"]);
    expect(read.scopes).toEqual([{ ownedBy: "person-a" }]);
  });

  it("prints the request, with its amount in words and the approval as a signature", async () => {
    const html = await render("03");
    expect(html).toContain("GIẤY ĐỀ NGHỊ TẠM ỨNG");
    expect(html).toContain("8.000.000 đồng");
    expect(html).toContain("Tám triệu đồng chẵn");
    expect(html).toContain("Approved · Dana Example · 14:05, Nov 3, 2026");
    expect(html).toContain("MST 0000000000");
  });

  it("has no settlement before the spending is frozen", async () => {
    await expect(render("04")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("prints the settlement once it is", async () => {
    read.answer = answer({ status: "settled" }, 8_000_000);
    expect(await render("04")).toContain("GIẤY THANH TOÁN TIỀN TẠM ỨNG");
  });

  it("answers not found for someone else's, an odd id and an odd form", async () => {
    read.answer = null;
    await expect(render("03")).rejects.toThrow("NEXT_NOT_FOUND");
    read.answer = answer();
    await expect(render("03", "nope")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(render("05")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("prints no company name when none is set, rather than one written in the code", async () => {
    read.answer = { ...answer(), facts: { ...facts, company: { name: null, taxCode: null } } };
    expect(await render("03")).not.toContain("MST");
  });
});
