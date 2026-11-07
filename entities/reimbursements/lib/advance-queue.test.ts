import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script, scriptStorage } from "@/kernel/data/testing/fake-company-os";

// What the approver reads to decide. The promises: a failed read raises, so nobody decides
// on less than there is; a draft nobody sent stays its owner's; and no bank detail is read
// out, only whether there is one.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/config/dates", async (importActual) => ({ ...(await importActual<typeof import("@/kernel/config/dates")>()), saigonToday: () => "2026-11-05" }));
vi.mock("./advance-decisions", () => ({}));
const calendar = vi.hoisted(() => ({ days: [] as { date: string; name: string }[] as { date: string; name: string }[] | "fails" }));
vi.mock("@/entities/time-off", () => ({
  holidayCalendar: async () => {
    if (calendar.days === "fails") throw new Error("calendar down");
    return calendar.days;
  },
}));
vi.mock("@/kernel/identity/people-holding", () => ({ peopleHolding: async () => [] }));
const bank = vi.hoisted(() => ({ answer: { ok: true, onFile: true } as { ok: true; onFile: boolean } | { ok: false; error: string } }));
vi.mock("./own-bank-details", () => ({
  readBankDetailsOnFile: async () => bank.answer,
  readOwnBankDetails: async () => {
    throw new Error("the approver's page read a bank account");
  },
}));
vi.mock("./advance-notices", () => ({}));
vi.mock("./claim-files", () => ({ RECEIPTS_BUCKET: "reimbursement-receipts", bytesMatchType: () => true, MAX_RECEIPT_BYTES: 1, RECEIPT_TYPES: [], sha256Hex: async () => "" }));
const trip = vi.hoisted(() => ({ id: "trip-1", title: "Hanoi retreat" }));
vi.mock("./trips", () => ({ readTrip: async () => trip }));
vi.mock("./notices", () => ({ ownerName: async () => "Avery Example" }));
const buyer = vi.hoisted(() => ({ answer: { state: "ready", slug: "example", legalName: "Example Co", address: null, taxCode: "0000000000" } as Record<string, unknown> }));
vi.mock("./red-invoice-buyer", () => ({ readRedInvoiceBuyer: async () => buyer.answer }));
vi.mock("./claim-items", () => ({ itemLabel: (r: { seller?: string }) => r.seller ?? "" }));

import { readAdvanceForDecision, readAdvanceForFinance, readAdvanceForForm, readAdvanceQueue } from "./advance-queue";

const raw = (over: Record<string, unknown> = {}) => ({
  id: "advance-1",
  ref_no: 7,
  status: "submitted",
  person_id: "person-a",
  purpose: "Venue deposit",
  amount_vnd: 8_000_000,
  spend_ends_on: "2026-11-13",
  settle_by: null,
  submitted_at: "2026-11-03T02:00:00Z",
  decided_by: null,
  balance_vnd: null,
  trip_event_id: null,
  ...over,
});

const YEARS = [{ date: "2026-02-17", name: "Tết" }, { date: "2027-02-05", name: "Tết" }];

function scriptRest(others: unknown[] = []) {
  script("reimbursement_advances", { data: others });
  script("reimbursement_advance_files", { data: [] }, { data: [] });
  script("reimbursement_advance_events", { data: [] });
}

beforeEach(() => {
  resetFake();
  calendar.days = YEARS;
  bank.answer = { ok: true, onFile: true };
  buyer.answer = { state: "ready", slug: "example", legalName: "Example Co", address: null, taxCode: "0000000000" };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("readAdvanceForDecision", () => {
  it("answers null when there is no such advance", async () => {
    script("reimbursement_advances", { data: [] });
    expect(await readAdvanceForDecision("advance-1")).toBeNull();
  });

  it("answers null for a draft nobody ever sent: it was asked of no one", async () => {
    script("reimbursement_advances", { data: [raw({ status: "draft", submitted_at: null })] });
    expect(await readAdvanceForDecision("advance-1")).toBeNull();
  });

  it("shows one that was withdrawn, since the approver's email still links here", async () => {
    script("reimbursement_advances", { data: [raw({ status: "draft" })] });
    scriptRest();
    expect((await readAdvanceForDecision("advance-1"))?.row.status).toBe("draft");
  });

  it("raises when the advance cannot be read, rather than saying there is none", async () => {
    script("reimbursement_advances", { data: null, error: { message: "down" } });
    await expect(readAdvanceForDecision("advance-1")).rejects.toThrow("down");
  });

  it("refuses a status this code does not know, rather than guessing what to offer", async () => {
    script("reimbursement_advances", { data: [raw({ status: "overdue" })] });
    await expect(readAdvanceForDecision("advance-1")).rejects.toThrow(/status/);
  });

  it("names the asker and the event", async () => {
    script("reimbursement_advances", { data: [raw({ trip_event_id: "trip-1" })] });
    scriptRest();
    expect(await readAdvanceForDecision("advance-1")).toMatchObject({ ownerName: "Avery Example", tripName: "Hanoi retreat" });
  });

  it("keeps only evidence, signed where it could be, and reads no bank receipt to the approver", async () => {
    script("reimbursement_advances", { data: [raw()] });
    script("reimbursement_advances", { data: [] });
    script(
      "reimbursement_advance_files",
      { data: [{ id: "f1", filename: "q.png", kind: "evidence", mime_type: "image/png", replaced_at: null }, { id: "f2", filename: "old.pdf", kind: "evidence", mime_type: "application/pdf", replaced_at: "t" }, { id: "f3", filename: "bank.pdf", kind: "bank_receipt", mime_type: "application/pdf", replaced_at: null }] },
      { data: [{ id: "f1", storage_path: "p1" }] },
    );
    script("reimbursement_advance_events", { data: [] });
    scriptStorage("createSignedUrls", { data: [{ path: "p1", signedUrl: "https://signed/1" }] });
    const advance = await readAdvanceForDecision("advance-1");
    expect(advance?.evidence).toEqual([
      { id: "f1", filename: "q.png", kind: "evidence", mimeType: "image/png", replaced: false, url: "https://signed/1" },
      { id: "f2", filename: "old.pdf", kind: "evidence", mimeType: "application/pdf", replaced: true, url: null },
    ]);
  });

  it("raises when the evidence cannot be read, rather than showing a request with nothing behind it", async () => {
    script("reimbursement_advances", { data: [raw()] });
    script("reimbursement_advances", { data: [] });
    script("reimbursement_advance_files", { data: null, error: { message: "files down" } }, { data: [] });
    script("reimbursement_advance_events", { data: [] });
    await expect(readAdvanceForDecision("advance-1")).rejects.toThrow("files down");
  });

  it("never reads a bank account: it asks only whether one is on file, and the reader that returns one raises here", async () => {
    script("reimbursement_advances", { data: [raw()] });
    scriptRest();
    await expect(readAdvanceForDecision("advance-1")).resolves.not.toBeNull();
  });
});

describe("what it checked", () => {
  async function checks() {
    script("reimbursement_advances", { data: [raw()] });
    scriptRest();
    return (await readAdvanceForDecision("advance-1"))?.checks ?? [];
  }

  it("says all four hold on a clean request, with the date a transfer today would set", async () => {
    const found = await checks();
    expect(found.map((c) => c.holds)).toEqual([true, true, true, true]);
    expect(found.map((c) => c.text)[1]).toContain("₫10,000,000");
    expect(found[3].text).toMatch(/^Settle by .* if the money is sent today\.$/);
  });

  it("says when another advance is open", async () => {
    script("reimbursement_advances", { data: [raw()] });
    scriptRest([{ id: "advance-2" }]);
    expect((await readAdvanceForDecision("advance-1"))?.checks[0]).toEqual({ holds: false, text: "Another advance is open for this person." });
  });

  it("flags an amount over the limit, which the rules should already have refused", async () => {
    script("reimbursement_advances", { data: [raw({ amount_vnd: 10_000_001 })] });
    scriptRest();
    expect((await readAdvanceForDecision("advance-1"))?.checks[1]).toEqual({ holds: false, text: "Over the ₫10,000,000 limit." });
  });

  it("says when no bank details are on file, or they could not be read, and never that they are fine", async () => {
    bank.answer = { ok: true, onFile: false };
    expect((await checks())[2]).toEqual({ holds: false, text: "No bank details on file, so Finance has nowhere to send it." });
    resetFake();
    bank.answer = { ok: false, error: "secret database words" };
    const unread = (await checks())[2];
    expect(unread.holds).toBe(false);
    expect(unread.text).not.toContain("secret");
  });

  it("warns when the calendar is unread or incomplete, which is what the payout would refuse on", async () => {
    calendar.days = "fails";
    expect((await checks())[3].holds).toBe(false);
    resetFake();
    calendar.days = [];
    expect((await checks())[3].text).toMatch(/holiday calendar is not complete/);
  });
});

describe("readAdvanceQueue", () => {
  it("asks only for what was ever sent: a draft nobody sent is its owner's", async () => {
    script("reimbursement_advances", { data: [] });
    expect(await readAdvanceQueue()).toEqual([]);
    expect(calls.filter((c) => c.table === "reimbursement_advances").flatMap((c) => c.filters)).toEqual(expect.arrayContaining([["not", "submitted_at", "is", null]]));
  });

  it("adds each advance's returns, and reads its newest settlement", async () => {
    script("reimbursement_advances", { data: [{ ...raw({ status: "to_return", balance_vnd: -1_000_000 }), person: { display_name: "Avery Example" } }, { ...raw({ id: "advance-2", status: "approved" }), person: null }] });
    script("reimbursement_advance_transfers", { data: [{ advance_id: "advance-1", amount_vnd: 400_000 }, { advance_id: "advance-1", amount_vnd: 100_000 }] });
    script("reimbursement_claims", { data: [{ advance_id: "advance-1", status: "sent_back" }, { advance_id: "advance-1", status: "submitted" }] });
    script("reimbursement_advance_events", { data: [] });
    const queue = await readAdvanceQueue();
    expect(queue[0]).toMatchObject({ ownerName: "Avery Example", returnedVnd: 500_000, claimStatus: "submitted" });
    expect(queue[1]).toMatchObject({ ownerName: "Someone", returnedVnd: 0, claimStatus: null });
  });

  it("marks an approved advance Finance put back, reading the history only when something is approved", async () => {
    script("reimbursement_advances", { data: [raw({ status: "approved" }), raw({ status: "approved", id: "advance-2" })] });
    script("reimbursement_advance_transfers", { data: [] });
    script("reimbursement_claims", { data: [] });
    script("reimbursement_advance_events", { data: [{ advance_id: "advance-2" }] });
    const queue = await readAdvanceQueue();
    expect(queue.map((q) => q.putBack)).toEqual([false, true]);
    expect(calls.find((c) => c.table === "reimbursement_advance_events")?.filters).toEqual(expect.arrayContaining([["eq", "move", "reinstate"]]));
  });

  it("raises when any read fails, rather than showing less money than there is", async () => {
    script("reimbursement_advances", { data: [raw()] });
    script("reimbursement_advance_transfers", { data: null, error: { message: "ledger down" } });
    script("reimbursement_claims", { data: [] });
    await expect(readAdvanceQueue()).rejects.toThrow("ledger down");
  });

  it("refuses a status this code does not know", async () => {
    script("reimbursement_advances", { data: [raw({ status: "overdue" })] });
    script("reimbursement_advance_transfers", { data: [] });
    script("reimbursement_claims", { data: [] });
    await expect(readAdvanceQueue()).rejects.toThrow(/status/);
  });
});

describe("readAdvanceForFinance", () => {
  // Constants, because the fork scanner refuses a bank-shaped value beside its column.
  const BANK_NAME = "Example Bank";
  const ACCOUNT_END = "9999";
  const transfer = (over: Record<string, unknown>) => ({ id: "t1", direction: "out", amount_vnd: 8_000_000, transferred_on: "2026-11-04", bank_receipt_file_id: "f2", bank_name_snapshot: BANK_NAME, bank_account_last4: ACCOUNT_END, ...over });
  const scriptDetail = (files: unknown[] = [], transfers: unknown[] = [], events: unknown[] = [], claims: unknown[] = []) => {
    script("reimbursement_advance_files", { data: files });
    script("reimbursement_advance_events", { data: events });
    script("reimbursement_advance_transfers", { data: transfers });
    script("reimbursement_claims", { data: claims });
  };

  it("answers null when there is none, and for a draft nobody sent", async () => {
    script("reimbursement_advances", { data: [] });
    expect(await readAdvanceForFinance("advance-1")).toBeNull();
    script("reimbursement_advances", { data: [raw({ status: "draft", submitted_at: null })] });
    expect(await readAdvanceForFinance("advance-1")).toBeNull();
  });

  it("raises when the ledger cannot be read, rather than showing an advance as never paid", async () => {
    script("reimbursement_advances", { data: [raw({ status: "paid_out" })] });
    script("reimbursement_advance_files", { data: [] });
    script("reimbursement_advance_events", { data: [] });
    script("reimbursement_advance_transfers", { data: null, error: { message: "ledger down" } });
    script("reimbursement_claims", { data: [] });
    await expect(readAdvanceForFinance("advance-1")).rejects.toThrow("ledger down");
  });

  it("works out what is owed and account 141 from the ledger, and they agree", async () => {
    script("reimbursement_advances", { data: [raw({ status: "to_return", spent_vnd: 7_000_000, balance_vnd: -1_000_000 })] });
    scriptDetail([], [transfer({}), transfer({ id: "t2", direction: "in", amount_vnd: 400_000, bank_receipt_file_id: null })], [{ id: "e1", move: "close", reason: null, created_at: "2026-11-16T03:00:00Z", actor: null }]);
    const advance = await readAdvanceForFinance("advance-1");
    expect(advance).toMatchObject({ returnedVnd: 400_000, owedVnd: 600_000 });
    expect(advance?.account.balanceVnd).toBe(600_000);
    expect(advance?.account.entries[1]).toMatchObject({ on: "2026-11-16", creditVnd: 7_000_000 });
  });

  it("finds a finished bank receipt no transfer cites, so a lost recording does not need a new upload", async () => {
    const file = (id: string, kind: string) => ({ id, filename: `${id}.pdf`, kind, mime_type: "application/pdf", replaced_at: null });
    script("reimbursement_advances", { data: [raw({ status: "approved" })] });
    scriptDetail([file("f1", "evidence"), file("f2", "bank_receipt"), file("f3", "bank_receipt")], [transfer({})]);
    expect((await readAdvanceForFinance("advance-1"))?.unusedReceipt).toEqual({ id: "f3", filename: "f3.pdf" });
  });

  it("offers none when every receipt is cited, and never offers the quote", async () => {
    const file = (id: string, kind: string) => ({ id, filename: `${id}.pdf`, kind, mime_type: "application/pdf", replaced_at: null });
    script("reimbursement_advances", { data: [raw({ status: "paid_out" })] });
    scriptDetail([file("f1", "evidence"), file("f2", "bank_receipt")], [transfer({})]);
    expect((await readAdvanceForFinance("advance-1"))?.unusedReceipt).toBeNull();
  });

  it("lets a transfer recorded since answer what the owner said", async () => {
    script("reimbursement_advances", { data: [raw({ status: "to_return", spent_vnd: 0, balance_vnd: -8_000_000, metadata: { returnReportedAt: "t", returnReportedAtVnd: 0 } })] });
    scriptDetail([], [{ id: "t1", direction: "in", amount_vnd: 400_000, transferred_on: "2026-11-20", bank_receipt_file_id: null, created_at: "t" }]);
    expect(await readAdvanceForFinance("advance-1")).toMatchObject({ returnReported: false, returnedVnd: 400_000 });
  });

  it("names who approved it, and knows the owner said they sent it", async () => {
    script("reimbursement_advances", { data: [raw({ status: "to_return", spent_vnd: 0, balance_vnd: -8_000_000, metadata: { returnReportedAt: "t", returnReportedAtVnd: 0 } })] });
    scriptDetail([], [], [{ id: "e1", move: "approve", reason: null, created_at: "t", actor: { display_name: "Dana Example" } }]);
    expect(await readAdvanceForFinance("advance-1")).toMatchObject({ approvedBy: "Dana Example", returnReported: true });
  });
});

describe("readAdvanceForForm", () => {
  const rows = () => calls.filter((c) => c.table === "reimbursement_advances").flatMap((c) => c.filters);

  it("narrows to the owner in the query when asked to", async () => {
    script("reimbursement_advances", { data: [] });
    expect(await readAdvanceForForm("advance-1", { ownedBy: "person-a" })).toBeNull();
    expect(rows()).toEqual(expect.arrayContaining([["eq", "person_id", "person-a"]]));
  });

  it("has no paper for a draft nobody sent", async () => {
    script("reimbursement_advances", { data: [raw({ status: "draft", submitted_at: null })] });
    expect(await readAdvanceForForm("advance-1", {})).toBeNull();
  });

  it("gathers who acted, in Vietnam's dates, and the receipts it kept", async () => {
    script("reimbursement_advances", { data: [raw({ status: "settled", spent_vnd: 700, balance_vnd: 0, submitted_at: "2026-11-02T20:00:00Z" })] });
    script("reimbursement_advance_events", { data: [{ id: "e2", move: "close", reason: null, created_at: "2026-11-16T03:00:00Z", actor: { display_name: "Blair Example" } }, { id: "e1", move: "approve", reason: null, created_at: "2026-11-03T03:00:00Z", actor: { display_name: "Dana Example" } }] });
    script("reimbursement_claims", { data: [{ id: "claim-1", submitted_at: "2026-11-14T01:00:00Z" }] });
    script("reimbursement_claim_items", { data: [{ seller: "Hall", amount_vnd: 700, declined_at: null, removed_at: null }, { seller: "Refused", amount_vnd: 900, declined_at: "t", removed_at: null }, { seller: "Removed", amount_vnd: 900, declined_at: null, removed_at: "t" }] });
    const form = await readAdvanceForForm("advance-1", {});
    expect(form?.facts).toMatchObject({
      asked: { at: "2026-11-02T20:00:00Z" },
      approved: { by: "Dana Example" },
      settlementApproved: null,
      checkApproved: { by: "Blair Example", at: "2026-11-16T03:00:00Z" },
      returnRecorded: null,
      ownerSent: { at: "2026-11-14T01:00:00Z" },
      closedOn: "2026-11-16",
      spentVnd: 700,
      items: [{ label: "Hall", vnd: 700 }],
    });
  });

  it("signs the approver as having decided it only when the close says the approver did", async () => {
    script("reimbursement_advances", { data: [raw({ status: "settled", spent_vnd: 700, balance_vnd: 0 })] });
    script("reimbursement_advance_events", { data: [{ id: "e2", move: "close", reason: null, created_at: "2026-11-16T03:00:00Z", metadata: { approvedAs: "approval" }, actor: { display_name: "Dana Example" } }] });
    script("reimbursement_claims", { data: [] });
    const form = await readAdvanceForForm("advance-1", {});
    expect(form?.facts).toMatchObject({ settlementApproved: { by: "Dana Example" }, checkApproved: null });
  });

  // The owner must never print as someone who approved or recorded anything.
  it("returned unspent: nobody approved a settlement, and the owner is only the one who sent it", async () => {
    script("reimbursement_advances", { data: [raw({ status: "to_return", spent_vnd: 0, balance_vnd: -700 })] });
    script("reimbursement_advance_events", { data: [{ id: "e1", move: "return_unspent", reason: null, created_at: "2026-11-16T03:00:00Z", actor: { display_name: "Avery Owner" } }] });
    script("reimbursement_claims", { data: [] });
    const form = await readAdvanceForForm("advance-1", {});
    expect(form?.facts).toMatchObject({ settlementApproved: null, returnRecorded: null, ownerSent: { at: "2026-11-16T03:00:00Z" }, closedOn: "2026-11-16" });
  });

  it("signs for the last of a return that came in parts, and leaves an unnamed actor unnamed", async () => {
    script("reimbursement_advances", { data: [raw({ status: "settled", spent_vnd: 0, balance_vnd: -700 })] });
    script("reimbursement_advance_events", {
      data: [
        { id: "e3", move: "confirm_return", reason: null, created_at: "2026-11-20T03:00:00Z", actor: null },
        { id: "e2", move: "confirm_return", reason: null, created_at: "2026-11-18T03:00:00Z", actor: { display_name: "Blair Example" } },
      ],
    });
    script("reimbursement_claims", { data: [] });
    const form = await readAdvanceForForm("advance-1", {});
    expect(form?.facts.returnRecorded).toEqual({ by: null, at: "2026-11-20T03:00:00Z" });
  });

  it("takes the company from the legal entity, and leaves it blank when none is set", async () => {
    script("reimbursement_advances", { data: [raw()] });
    script("reimbursement_advance_events", { data: [] });
    script("reimbursement_claims", { data: [] });
    expect((await readAdvanceForForm("advance-1", {}))?.facts.company).toEqual({ name: "Example Co", taxCode: "0000000000" });
    buyer.answer = { state: "not_configured" };
    script("reimbursement_advances", { data: [raw()] });
    script("reimbursement_advance_events", { data: [] });
    script("reimbursement_claims", { data: [] });
    expect((await readAdvanceForForm("advance-1", {}))?.facts.company).toEqual({ name: null, taxCode: null });
  });

  it("raises when the legal entity cannot be read, rather than printing a paper with no company", async () => {
    buyer.answer = { state: "unavailable" };
    script("reimbursement_advances", { data: [raw()] });
    script("reimbursement_advance_events", { data: [] });
    script("reimbursement_claims", { data: [] });
    await expect(readAdvanceForForm("advance-1", {})).rejects.toThrow("legal entity");
  });

  it("raises when the receipts cannot be read, rather than printing a settlement with none", async () => {
    script("reimbursement_advances", { data: [raw({ status: "settled", spent_vnd: 700, balance_vnd: 0 })] });
    script("reimbursement_advance_events", { data: [] });
    script("reimbursement_claims", { data: [{ id: "claim-1" }] });
    script("reimbursement_claim_items", { data: null, error: { message: "down" } });
    await expect(readAdvanceForForm("advance-1", {})).rejects.toThrow("down");
  });
});
