import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The month-end export (RB.12): the claims PAID in a Vietnam calendar month,
// one spreadsheet row per receipt, and every document behind them named by
// claim and item.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("./trips", () => ({ readTrip: async (id: string) => (id === "trip-au" ? { id, title: "Australia retreat" } : null) }));

import { bundleFits, exportDocuments, exportSpreadsheet, isExportMonth, monthBounds, safeSegment } from "./export";

beforeEach(() => resetFake());

const PAID = {
  id: "aaaa1111-0000-4000-8000-000000000001",
  title: "Australia trip, taxis",
  trip_event_id: "trip-au",
  paid_at: "2026-10-16T03:00:00Z",
  payment_run_id: "run-15",
  payment_id: "pay-1",
  owner: { full_name: "Blair Moss" },
};

describe("monthBounds", () => {
  it("is 00:00 Vietnam time on the month's 1st and the next month's, as UTC instants", () => {
    expect(monthBounds("2026-10")).toEqual({ from: "2026-09-30T17:00:00.000Z", to: "2026-10-31T17:00:00.000Z" });
    expect(monthBounds("2026-12").to).toBe("2026-12-31T17:00:00.000Z");
    expect(isExportMonth("2026-13")).toBe(false);
    expect(isExportMonth("2026-10")).toBe(true);
  });
});

describe("exportSpreadsheet", () => {
  it("has one row per receipt of each claim paid in the month, with its rate, its VND, the rebill and the run", async () => {
    script("reimbursement_claims", { data: [PAID] });
    script("reimbursement_claim_items", {
      data: [
        {
          id: "i1",
          claim_id: PAID.id,
          position: 0,
          description: null,
          seller: "Uber",
          bought_on: "2026-10-02",
          category: "transport",
          amount_cents: 4550,
          currency: "aud",
          fx_rate: 16500,
          fx_source: "vietcombank",
          fx_as_of: "2026-10-02",
          amount_vnd: 750_750,
          declined_at: null,
          decline_reason: null,
          rebill: true,
          rebill_company: { name: "Acme Pty Ltd" },
        },
        {
          id: "i2",
          claim_id: PAID.id,
          position: 1,
          description: "Minibar",
          seller: "Hotel",
          bought_on: "2026-10-03",
          category: "other",
          amount_cents: 2000,
          currency: "aud",
          fx_rate: 16500,
          fx_source: "vietcombank",
          fx_as_of: "2026-10-03",
          amount_vnd: 330_000,
          declined_at: "2026-10-08T02:00:00Z",
          decline_reason: "Personal",
          rebill: false,
          rebill_company: null,
        },
        // Removed by its owner before the claim was resubmitted (20261008090000):
        // a row of the export, flagged, never counted.
        {
          id: "i3",
          claim_id: PAID.id,
          position: 2,
          description: null,
          seller: "Uber",
          bought_on: "2026-10-02",
          category: "transport",
          amount_cents: 4550,
          currency: "aud",
          fx_rate: 16500,
          fx_source: "vietcombank",
          fx_as_of: "2026-10-02",
          amount_vnd: 750_750,
          declined_at: null,
          decline_reason: null,
          removed_at: "2026-10-06T03:00:00Z",
          remove_reason: "Charged twice",
          rebill: true,
          rebill_company: { name: "Acme Pty Ltd" },
        },
      ],
    });
    script("reimbursement_payment_runs", { data: [{ id: "run-15", run_date: "2026-10-15" }] });
    const [head, first, second, third] = (await exportSpreadsheet("2026-10")).split("\r\n");
    expect(head).toBe(
      "Claimant,Claim,Claim id,Event,Category,Seller,Description,Date,Original amount,Currency,Rate,Rate source,Rate date,VND,Declined,Removed,Rebill to,Paid on,Payment run",
    );
    expect(first).toBe(`Blair Moss,"Australia trip, taxis",${PAID.id},Australia retreat,"Transport (Grab, Be, taxi, own driver)",Uber,,2026-10-02,45.50,AUD,16500,vietcombank,2026-10-02,750750,No,No,Acme Pty Ltd,2026-10-16,2026-10-15`);
    expect(second).toContain(",0,Yes: Personal,No,,2026-10-16,");
    // The removed receipt is listed with its marker and counts 0 VND, and is never rebilled.
    expect(third).toContain(",2026-10-02,0,No,Yes: Charged twice,,2026-10-16,2026-10-15");
    // Paid in the month, by its Vietnam calendar.
    expect(calls[0].filters).toEqual([
      ["eq", "status", "paid"],
      ["gte", "paid_at", "2026-09-30T17:00:00.000Z"],
      ["lt", "paid_at", "2026-10-31T17:00:00.000Z"],
    ]);
  });

  it("is a header-less empty file for a month with nothing paid", async () => {
    script("reimbursement_claims", { data: [] });
    expect(await exportSpreadsheet("2026-09")).toBe("");
  });
});

describe("exportDocuments", () => {
  it("names each receipt by its claim and item, and each bank receipt by who was paid", async () => {
    script("reimbursement_claims", { data: [PAID] });
    script("reimbursement_files", {
      data: [
        { id: "f1", kind: "red_invoice", filename: "HD-001.PDF", storage_path: "claim/c/i1/f1", size_bytes: 1000, replaced_at: null, reimbursement_claim_items: { claim_id: PAID.id, position: 0, seller: "Uber", category: "transport", removed_at: null } },
        // Kept for ten years and bundled, each named with its marker (20261008090000).
        { id: "f2", kind: "red_invoice", filename: "HD-000.pdf", storage_path: "claim/c/i1/f2", size_bytes: 900, replaced_at: "2026-10-06T03:00:00Z", reimbursement_claim_items: { claim_id: PAID.id, position: 0, seller: "Uber", category: "transport", removed_at: null } },
        { id: "f3", kind: "receipt", filename: "uber.jpg", storage_path: "claim/c/i3/f3", size_bytes: 800, replaced_at: null, reimbursement_claim_items: { claim_id: PAID.id, position: 2, seller: "Uber", category: "transport", removed_at: "2026-10-06T03:00:00Z" } },
      ],
    });
    script("reimbursement_payments", { data: [{ id: "pay-1", bank_receipt_file_id: "f9" }] });
    script("reimbursement_files", { data: [{ id: "f9", filename: "tcb.png", storage_path: "payment/r/p/f9", size_bytes: 2000, payment_id: "pay-1" }] });
    expect(await exportDocuments("2026-10")).toEqual([
      { name: "2026-10-16 Blair Moss - Australia trip- taxis [aaaa1111]/item 01 Uber - red invoice.pdf", storagePath: "claim/c/i1/f1", sizeBytes: 1000 },
      { name: "2026-10-16 Blair Moss - Australia trip- taxis [aaaa1111]/item 01 Uber - red invoice (replaced).pdf", storagePath: "claim/c/i1/f2", sizeBytes: 900 },
      { name: "2026-10-16 Blair Moss - Australia trip- taxis [aaaa1111]/item 03 Uber (removed) - receipt.jpg", storagePath: "claim/c/i3/f3", sizeBytes: 800 },
      { name: "bank receipts/2026-10-16 Blair Moss - aaaa1111.png", storagePath: "payment/r/p/f9", sizeBytes: 2000 },
    ]);
  });
});

describe("safeSegment and bundleFits", () => {
  it("keeps names every unzip tool accepts", () => {
    expect(safeSegment("Nguyễn Văn Đức / Hà Nội: taxi")).toBe("Nguyen Van Duc - Ha Noi- taxi");
    expect(safeSegment("../../etc")).toBe("etc");
  });

  it("refuses a bundle a plain zip cannot address", () => {
    expect(bundleFits([{ name: "a", sizeBytes: 1000 }])).toBe(true);
    expect(bundleFits([{ name: "a", sizeBytes: 4_294_967_200 }])).toBe(false);
  });
});
