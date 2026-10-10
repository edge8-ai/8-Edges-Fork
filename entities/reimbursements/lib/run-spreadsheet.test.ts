import { describe, expect, it } from "vitest";
import { runSpreadsheet, runSpreadsheetName } from "./run-spreadsheet";
import type { RunDetail } from "./run-view";

// A made-up account number in a constant, so no fixture writes one beside its column name.
const ACCOUNT = "19034567";

const run: RunDetail = {
  id: "run-1",
  runDate: "2026-10-15",
  status: "open",
  claims: 2,
  people: 1,
  totalVnd: 1_500_000,
  builtAt: "2026-10-15T01:00:00Z",
  paidAt: null,
  payments: [
    {
      id: "pay-1",
      personId: "p1",
      personName: "Blair Moss",
      state: "to_pay",
      amountVnd: 1_500_000,
      paidVnd: null,
      paidAt: null,
      receiptFileId: null,
      bankNameSnapshot: null,
      accountLast4: null,
      returnReason: null,
      claims: [
        { id: "c3", title: "=Client lunch", submittedAt: "2026-10-09T02:00:00Z", approvedTotalVnd: 500_000, status: "in_run" },
        { id: "c1", title: "Australia trip, taxis", submittedAt: "2026-10-05T02:00:00Z", approvedTotalVnd: 1_000_000, status: "in_run" },
      ],
    },
  ],
};

describe("runSpreadsheet", () => {
  it("has one row per person with their claims, dates, amount, status and bank details", () => {
    const csv = runSpreadsheet(run, new Map([["p1", { bankName: "Techcombank", accountNumber: ACCOUNT, branch: "Hanoi" }]]));
    const [head, row] = csv.split("\r\n");
    expect(head).toBe("Name,Claims,Request dates,Amount (VND),Status,Paid (VND),Bank,Account number,Branch,Account holder");
    // A title starting with "=" is text, never a formula.
    expect(row).toBe(`Blair Moss,"\t=Client lunch / Australia trip, taxis",2026-10-09 / 2026-10-05,1500000,To pay,,Techcombank,${ACCOUNT},Hanoi,Blair Moss`);
  });

  it("is named for the run's date", () => {
    expect(runSpreadsheetName("2026-10-15")).toBe("payment-run-2026-10-15.csv");
  });
});
