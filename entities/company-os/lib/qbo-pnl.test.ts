import { describe, expect, it, vi } from "vitest";

vi.mock("@/entities/company-os/lib/qbo", () => ({ qboFetch: vi.fn() }));

import { parsePnlReport, type PnlReport } from "./qbo-pnl";

// The shape of QuickBooks' ProfitAndLoss report with summarize_column_by=Month,
// trimmed to two months and invented figures: an account column, one column
// per month carrying its StartDate, and the Total column, which is not a month.
const month = (title: string, start: string) => ({
  ColTitle: title,
  ColType: "Money",
  MetaData: [{ Name: "StartDate", Value: start }, { Name: "EndDate", Value: start }, { Name: "ColKey", Value: title }],
});
const report: PnlReport = {
  Header: { Currency: "USD" },
  Columns: {
    Column: [
      { ColTitle: "", ColType: "Account", MetaData: [{ Name: "ColKey", Value: "account" }] },
      month("Jan 2026", "2026-01-01"),
      month("Feb 2026", "2026-02-01"),
      { ColTitle: "Total", ColType: "Money", MetaData: [{ Name: "ColKey", Value: "total" }] },
    ],
  },
  Rows: {
    Row: [
      {
        type: "Section",
        group: "Income",
        Header: { ColData: [{ value: "Income" }, { value: "" }, { value: "" }, { value: "" }] },
        Rows: { Row: [{ type: "Data", ColData: [{ value: "Services", id: "1" }, { value: "1000.00" }, { value: "1,200.50" }, { value: "2200.50" }] }] },
      },
      { type: "Section", group: "GrossProfit", Rows: { Row: [] } },
      {
        type: "Section",
        group: "Expenses",
        Header: { ColData: [{ value: "Expenses" }, { value: "" }, { value: "" }, { value: "" }] },
        Rows: {
          Row: [
            {
              type: "Section",
              Header: { ColData: [{ value: "Contract Labor Costs", id: "10" }, { value: "5.00" }, { value: "" }, { value: "5.00" }] },
              Rows: { Row: [{ type: "Data", ColData: [{ value: "Staffing Contractor", id: "11" }, { value: "600.00" }, { value: "650.00" }, { value: "1250.00" }] }] },
            },
            { type: "Data", ColData: [{ value: "Uncategorized Expense" }, { value: "" }, { value: "-12.50" }, { value: "-12.50" }] },
          ],
        },
      },
      { type: "Section", group: "NetIncome", Rows: { Row: [] } },
    ],
  },
};

describe("parsePnlReport", () => {
  const { lines, currency } = parsePnlReport(report);
  const of = (id: string) => lines.filter((l) => l.externalId === id);

  it("writes one line per account per month, never the Total column", () => {
    expect(lines).toHaveLength(8);
    expect(new Set(lines.map((l) => l.month))).toEqual(new Set(["2026-01-01", "2026-02-01"]));
    expect(currency).toBe("USD");
  });

  it("reads amounts into cents, blanks as zero and credits as negative", () => {
    expect(of("1").map((l) => l.amountCents)).toEqual([1_000_00, 1_200_50]);
    expect(of("name:Uncategorized Expense").map((l) => l.amountCents)).toEqual([0, -12_50]);
  });

  it("keeps a parent's own amount and hangs its sub-accounts under it", () => {
    expect(of("10").map((l) => [l.amountCents, l.parentExternalId])).toEqual([[5_00, null], [0, null]]);
    expect(of("11").map((l) => l.parentExternalId)).toEqual(["10", "10"]);
    expect(of("11")[0].section).toBe("expense");
  });

  it("numbers the accounts in report order", () => {
    const order = [...new Map(lines.map((l) => [l.externalId, l.position])).entries()];
    expect(order).toEqual([["1", 1], ["10", 2], ["11", 3], ["name:Uncategorized Expense", 4]]);
  });
});
