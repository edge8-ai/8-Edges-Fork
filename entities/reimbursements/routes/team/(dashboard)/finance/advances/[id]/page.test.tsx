import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Finance's page for one advance. What matters: the account is read, and audited, only
// when this viewer has a transfer to make; whoever approved it cannot record it; and each
// state offers only what the ledger would accept.
const asked = vi.hoisted(() => [] as string[]);
const payers = vi.hoisted(() => ({ ids: ["person-t", "person-d"] as string[] }));
vi.mock("@/kernel/identity/people-holding", () => ({ peopleHolding: async () => payers.ids }));
const viewer = vi.hoisted(() => ({ personId: "person-t" as string | null, checks: false }));
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (p: string) => {
    asked.push(p);
    return { personId: viewer.personId, user: { email: "payer@test" }, may: (q: string) => q === "reimbursements.check" && viewer.checks };
  },
}));
vi.mock("@/kernel/identity/may-prop", () => ({ mayProp: () => ({ "reimbursements.pay": true }) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push() {}, refresh() {} }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("../actions", () => ({
  cancelBankReceipt: async () => ({ ok: true }),
  confirmBankReceipt: async () => ({ ok: true }),
  openAdvanceFileToPay: async () => ({ ok: true, url: "" }),
  payOutAdvance: async () => ({ ok: true }),
  recordAdvanceReturn: async () => ({ ok: true }),
  reinstateCancelledAdvance: async () => ({ ok: true }),
  startBankReceipt: async () => ({ ok: false, error: "" }),
}));
const read = vi.hoisted(() => ({ advance: null as unknown, asked: 0 }));
vi.mock("@/entities/reimbursements/lib/advance-queue", () => ({
  readAdvanceForFinance: async () => {
    read.asked += 1;
    return read.advance;
  },
}));
const bank = vi.hoisted(() => ({
  reads: [] as Record<string, unknown>[],
  answer: { ok: true, bank: { bankName: "Example Bank", accountNumber: "ACCOUNT-ON-FILE", branch: "Saigon" } } as { ok: true; bank: { bankName: string; accountNumber: string; branch: string } | null } | { ok: false; error: string },
}));
vi.mock("@/entities/reimbursements/lib/bank-details", () => ({
  readAdvancePayeeBank: async (i: Record<string, unknown>) => (bank.reads.push(i), bank.answer),
}));

import FinanceAdvancePage from "./page";

const ID = "22222222-2222-4222-8222-222222222222";
const FULL_BANK = { ok: true as const, bank: { bankName: "Example Bank", accountNumber: "ACCOUNT-ON-FILE", branch: "Saigon" } };
const advance = (over: Record<string, unknown> = {}, more: Record<string, unknown> = {}) => ({
  row: { id: ID, refNo: 7, status: "approved", personId: "person-a", purpose: "Venue deposit", amountVnd: 8_000_000, spendEndsOn: "2026-11-13", settleBy: null, submittedAt: "2026-11-03T02:00:00+00:00", decidedBy: "person-d", balanceVnd: null, ...over },
  ownerName: "Avery Example",
  spentVnd: null,
  approvedBy: "Dana Example",
  claim: null,
  returnReported: false,
  returnedVnd: 0,
  owedVnd: 0,
  transfers: [],
  account: { entries: [], balanceVnd: 0 },
  files: [],
  unusedReceipt: null,
  events: [],
  ...more,
});

const render = async () => renderToStaticMarkup(await FinanceAdvancePage({ params: Promise.resolve({ id: ID }) }));

beforeEach(() => {
  asked.length = 0;
  bank.reads.length = 0;
  bank.answer = FULL_BANK;
  read.asked = 0;
  read.advance = advance();
  viewer.personId = "person-t";
  viewer.checks = false;
});

describe("an approved advance", () => {
  it("asks for reimbursements.pay, and shows where to send it and the exact reference", async () => {
    const html = await render();
    expect(asked).toEqual(["reimbursements.pay"]);
    expect(html).toContain("ACCOUNT-ON-FILE");
    expect(html).toContain("ADV-0007 TAM UNG");
    expect(html).toContain("Record the transfer");
  });

  it("audits the read of the account as this panel, naming who opened it", async () => {
    await render();
    expect(bank.reads).toEqual([{ personId: "person-a", advanceId: ID, actor: "payer@test", purpose: "advance_panel" }]);
  });

  it("keeps the record button off until a receipt is attached, and on with one left from a lost try", async () => {
    expect(await render()).toMatch(/disabled=""[^>]*>Record the transfer/);
    read.advance = advance({}, { unusedReceipt: { id: "f1", filename: "bank.pdf" } });
    const html = await render();
    expect(html).not.toMatch(/disabled=""[^>]*>Record the transfer/);
    expect(html).toContain("bank.pdf");
  });

  it("says so when they have no bank details, and shows no empty rows to copy", async () => {
    bank.answer = { ok: true, bank: null };
    const html = await render();
    expect(html).toContain("has no bank details on file");
    expect(html).not.toContain(">Copy<");
    expect(html).not.toContain("Record the transfer");
  });

  it("says why when the account could not be read, and offers no way to record", async () => {
    bank.answer = { ok: false, error: "Could not read the bank details: down" };
    const html = await render();
    expect(html).toContain("Could not read the bank details");
    expect(html).not.toContain("Record the transfer");
  });
});

describe("a transfer on the ledger whose status write was lost", () => {
  const onLedger = { id: "t1", direction: "out", amountVnd: 8_000_000, transferredOn: "2026-11-04", receiptFileId: "f1", bankName: null, accountLast4: null };

  it("offers to finish it, asks for no second receipt, and reads no account: nobody is sending anything again", async () => {
    read.advance = advance({}, { transfers: [onLedger] });
    const html = await render();
    expect(html).toContain("Finish recording the transfer");
    expect(html).toContain("Nobody needs to send anything again");
    expect(html).not.toContain("Record the transfer");
    expect(bank.reads).toHaveLength(0);
  });
});

describe("a cancel that may have crossed the transfer", () => {
  const event = (move: string, reason: string | null = null) => ({ id: move, move, actorName: "Someone", reason, at: "2026-11-05T02:00:00Z", approvedAs: null });
  const crossed = { events: [event("cancel", "The venue moved the date."), event("approve")] };

  it("offers a way back on one cancelled after approval, says why it was cancelled, and reads no account", async () => {
    read.advance = advance({ status: "cancelled" }, crossed);
    const html = await render();
    expect(html).toContain("Already sent it?");
    expect(html).toContain("The venue moved the date.");
    expect(html).toContain("If the money has not gone, do not send it.");
    expect(html).not.toContain("Record the transfer");
    expect(bank.reads).toHaveLength(0);
  });

  it("offers none on one nobody approved", async () => {
    read.advance = advance({ status: "cancelled" }, { events: [event("cancel")] });
    const html = await render();
    expect(html).not.toContain("Already sent it?");
    expect(html).toContain("Do not send it");
  });

  it("tells the approver and the owner why they cannot", async () => {
    viewer.personId = "person-d";
    read.advance = advance({ status: "cancelled" }, crossed);
    let html = await render();
    expect(html).not.toContain("Already sent it?");
    expect(html).toContain("someone else puts it back");
    viewer.personId = "person-a";
    html = await render();
    expect(html).not.toContain("Already sent it?");
    expect(html).toContain("your own advance");
  });

  it("once back, asks to record it rather than send it, and reads no account", async () => {
    read.advance = advance({ status: "approved" }, { events: [event("reinstate", "It went at 09:40."), ...crossed.events] });
    const html = await render();
    expect(html).toContain("Nobody needs to send it again");
    expect(html).toContain("It went at 09:40.");
    expect(html).toContain("Record the transfer you made");
    expect(html).toContain("Back on · record it");
    expect(html).not.toContain("Approved · being sent");
    expect(html).not.toContain("Transfer it today");
    expect(html).not.toContain("ACCOUNT-ON-FILE");
    expect(bank.reads).toHaveLength(0);
  });
});

describe("the four eyes on the money", () => {
  it("shows whoever approved it no account and no form, and does not read the account for them", async () => {
    viewer.personId = "person-d";
    const html = await render();
    expect(html).toContain("You approved this advance, so someone else records its transfer.");
    expect(html).not.toContain("ACCOUNT-ON-FILE");
    expect(html).not.toContain("Record the transfer");
    expect(bank.reads).toHaveLength(0);
  });

  it("offers the form to the approver when the owner is the only other payer, and says why", async () => {
    payers.ids = ["person-d", "person-a"];
    viewer.personId = "person-d";
    const html = await render();
    expect(html).toContain("the only other person who records transfers");
    expect(html).toContain("Record the transfer");
    payers.ids = ["person-t", "person-d"];
  });

  it("does the same for someone with no person record", async () => {
    viewer.personId = null;
    const html = await render();
    expect(html).not.toContain("Record the transfer");
    expect(bank.reads).toHaveLength(0);
  });
});

describe("no transfer to make", () => {
  it.each([
    ["submitted", "Waiting for approval"],
    ["sent_back", "Sent back to Avery Example"],
    ["rejected", "Rejected, so no money moves"],
    ["cancelled", "Do not send it"],
    ["draft", "withdrew this request"],
    ["settled", "Closed. Nothing is owed either way"],
  ])("on one that is %s, it says so, offers nothing and reads no account", async (status, says) => {
    read.advance = advance({ status });
    const html = await render();
    expect(html).toContain(says);
    expect(html).not.toContain("Record the transfer");
    expect(html).not.toContain("Record money received");
    expect(bank.reads).toHaveLength(0);
  });

  it("names the date on one held, and says overdue past it", async () => {
    read.advance = advance({ status: "paid_out", settleBy: "2999-01-01" });
    expect(await render()).toContain("With Avery Example until");
    read.advance = advance({ status: "paid_out", settleBy: "2020-01-01" });
    expect(await render()).toContain("Overdue since");
  });

  it("does not call one overdue while its settlement is being checked, and links the claim only for a checker", async () => {
    read.advance = advance({ status: "paid_out", settleBy: "2020-01-01" }, { claim: { id: "claim-1", status: "submitted" } });
    let html = await render();
    expect(html).toContain("Its settlement is being checked");
    expect(html).not.toContain("Overdue");
    expect(html).not.toContain("/team/finance/claims/claim-1");
    viewer.checks = true;
    html = await render();
    expect(html).toContain("/team/finance/claims/claim-1");
  });
});

describe("money coming back", () => {
  const owing = (more: Record<string, unknown> = {}) => advance({ status: "to_return", settleBy: "2026-11-30", balanceVnd: -1_000_000 }, { owedVnd: 1_000_000, ...more });

  it("offers to record it with what is owed filled in, and reads no account", async () => {
    read.advance = owing();
    const html = await render();
    expect(html).toContain("Record money received");
    expect(html).toContain('value="1,000,000"');
    expect(html).toContain("Avery Example owes ₫1,000,000");
    expect(bank.reads).toHaveLength(0);
  });

  it("offers to close one whose returns already add up, rather than asking for a figure", async () => {
    read.advance = owing({ returnedVnd: 1_000_000, owedVnd: 0 });
    const html = await render();
    expect(html).toContain("Close the advance");
    expect(html).not.toContain("Record money received");
  });

  it("says why to someone with no person record, rather than that there is nothing to do", async () => {
    viewer.personId = null;
    read.advance = owing();
    const html = await render();
    expect(html).toContain("no person record");
    expect(html).not.toContain("Nothing to do");
    expect(html).not.toContain("Record money received");
  });

  it("gives a payer no way to record money back on their own advance, and says why", async () => {
    viewer.personId = "person-a";
    read.advance = owing();
    const html = await render();
    expect(html).toContain("your own advance");
    expect(html).not.toContain("Record money received");
  });

  it("says when money owed back is overdue", async () => {
    read.advance = advance({ status: "to_return", settleBy: "2020-01-01", balanceVnd: -1_000_000 }, { owedVnd: 1_000_000 });
    expect(await render()).toContain("Overdue since");
  });

  it("says the company owes the difference until a run pays it, then that it paid", async () => {
    read.advance = advance({ status: "settled", balanceVnd: 720_000 }, { spentVnd: 8_720_000, claim: { id: "claim-1", status: "approved" } });
    let html = await render();
    expect(html).toContain("The company pays Avery Example the difference, ₫720,000");
    expect(html).not.toContain("Nothing is owed");
    read.advance = advance({ status: "settled", balanceVnd: 720_000 }, { spentVnd: 8_720_000, claim: { id: "claim-1", status: "paid" } });
    html = await render();
    expect(html).toContain("The company paid Avery Example the difference, ₫720,000");
  });

  it("says what they reported, and that the bank decides", async () => {
    read.advance = owing({ returnReported: true });
    const html = await render();
    expect(html).toContain("ADV-0007 HOAN UNG");
    expect(html).toContain("Check the bank before you record it");
  });

  it("shows a report made after a part return, beside what has arrived", async () => {
    read.advance = owing({ returnedVnd: 400_000, owedVnd: 600_000, returnReported: true });
    const html = await render();
    expect(html).toContain("₫400,000 has arrived so far");
    expect(html).toContain("says ₫600,000 was sent");
  });

  it("says what has arrived and what is left", async () => {
    read.advance = owing({ returnedVnd: 400_000, owedVnd: 600_000 });
    expect(await render()).toContain("₫400,000 has arrived so far; ₫600,000 is still owed");
  });
});

describe("forms", () => {
  it("links the request once asked, and the settlement once settled", async () => {
    let html = await render();
    expect(html).toContain("/printable/03");
    expect(html).not.toContain("/printable/04");
    read.advance = advance({ status: "settled" }, { spentVnd: 8_000_000 });
    html = await render();
    expect(html).toContain("/printable/04");
  });
});

describe("files", () => {
  it("lists a bank receipt no transfer cites, so an upload is never out of sight", async () => {
    read.advance = advance({}, { files: [{ id: "f9", filename: "stray.pdf", kind: "bank_receipt", mimeType: "application/pdf", replaced: false }] });
    expect(await render()).toContain("stray.pdf (not on a transfer)");
  });
});

describe("the ledger", () => {
  it("is not shown before money moves", async () => {
    expect(await render()).not.toContain("Ledger · account 141");
  });

  it("shows each entry and the balance", async () => {
    read.advance = advance({ status: "paid_out", settleBy: "2026-11-30" }, { account: { entries: [{ on: "2026-11-04", what: "Payout · Nợ 141 / Có 112", debitVnd: 8_000_000, creditVnd: null }], balanceVnd: 8_000_000 } });
    const html = await render();
    expect(html).toContain("Payout · Nợ 141 / Có 112");
    expect(html).toContain("Balance with Avery Example");
  });
});

describe("what does not exist", () => {
  it("answers not found for an advance there is not", async () => {
    read.advance = null;
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("answers not found for an id that could not be one, without reading", async () => {
    await expect(FinanceAdvancePage({ params: Promise.resolve({ id: "nope" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(read.asked).toBe(0);
  });
});
