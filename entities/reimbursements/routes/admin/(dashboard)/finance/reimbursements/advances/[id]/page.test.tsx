import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// One advance in Admin. Its point: reimbursements.view is without bank details, so no account
// is read, no bank receipt is offered, and nothing here can move the advance.
const asked = vi.hoisted(() => [] as string[]);
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async (p: string) => void asked.push(p) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("../actions", () => ({ openAdvanceEvidenceInAdmin: async () => ({ ok: true, url: "" }) }));
const read = vi.hoisted(() => ({ advance: null as unknown }));
vi.mock("@/entities/reimbursements/lib/advance-queue", () => ({ readAdvanceForFinance: async () => read.advance }));
const bankRead = vi.hoisted(() => ({ reads: 0 }));
vi.mock("@/entities/reimbursements/lib/bank-details", () => ({ readAdvancePayeeBank: async () => (bankRead.reads += 1, { ok: true, bank: null }) }));

import Page from "./page";

const ID = "22222222-2222-4222-8222-222222222222";
const render = async (id = ID) => renderToStaticMarkup(await Page({ params: Promise.resolve({ id }) }));

beforeEach(() => {
  asked.length = 0;
  bankRead.reads = 0;
  read.advance = {
    row: { id: ID, refNo: 7, status: "approved", personId: "person-a", purpose: "Venue", amountVnd: 8_000_000, spendEndsOn: "2026-11-13", settleBy: "2026-11-30", submittedAt: "t", decidedBy: "person-d", balanceVnd: null },
    ownerName: "Avery Example",
    spentVnd: null,
    approvedBy: "Dana Example",
    transfers: [{ id: "t1", direction: "out", amountVnd: 8_000_000, transferredOn: "2026-11-04", receiptFileId: "f2", bankName: "MASKED-BANK", accountLast4: "9999" }],
    account: { entries: [{ on: "2026-11-04", what: "Payout · Nợ 141 / Có 112", debitVnd: 8_000_000, creditVnd: null }], balanceVnd: 8_000_000 },
    files: [
      { id: "f1", filename: "quote.pdf", kind: "evidence", mimeType: "application/pdf", replaced: false },
      { id: "f2", filename: "bank-slip.pdf", kind: "bank_receipt", mimeType: "application/pdf", replaced: false },
    ],
    events: [],
  };
});

describe("one advance in Admin", () => {
  it("asks for reimbursements.view, and shows where it stands and its ledger", async () => {
    const html = await render();
    expect(asked).toEqual(["reimbursements.view"]);
    expect(html).toContain("ADV-0007 · Avery Example");
    expect(html).toContain("Payout · Nợ 141 / Có 112");
    expect(html).toContain("/printable/03");
  });

  it("offers the quote and never the bank receipt, the account or even the masked record", async () => {
    const html = await render();
    expect(html).toContain("quote.pdf");
    expect(html).not.toContain("bank-slip.pdf");
    expect(html).not.toContain("MASKED-BANK");
    expect(html).not.toContain("9999");
    expect(bankRead.reads).toBe(0);
  });

  it("offers nothing that moves the advance", async () => {
    const html = await render();
    // Its only buttons open the quote. The status badge may well say "Approved".
    expect(html.match(/<button[^>]*>[^<]*/g)?.map((b) => b.replace(/<button[^>]*>/, ""))).toEqual(["Open quote.pdf"]);
  });

  // The review of AD.16's put-back: this page alone still read "being sent" for one.
  it("says a put-back advance is to be recorded, and stops saying so once it has moved on", async () => {
    const advance = read.advance as { row: { status: string }; transfers: unknown[]; events: unknown[] };
    advance.transfers = [];
    advance.events = [
      { id: "e1", move: "cancel", actorName: "Avery Example", reason: "No longer needed", at: "2026-11-05T02:00:00Z", approvedAs: null },
      { id: "e2", move: "reinstate", actorName: "Finance Example", reason: "It went at 09:40.", at: "2026-11-05T03:00:00Z", approvedAs: null },
    ];
    expect(await render()).toContain("Back on · record it");
    advance.row.status = "paid_out";
    expect(await render()).not.toContain("Back on");
  });

  it("answers not found for one that is not there, and an odd id", async () => {
    read.advance = null;
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(render("nope")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
