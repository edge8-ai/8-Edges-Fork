import { describe, expect, it } from "vitest";
import { buildStatement, monthsBetween, type PnlLine } from "./pnl-statement";

// Invented figures in the shape of a QuickBooks "Profit and Loss by Month":
// two income accounts, a parent expense with its own amount and two
// sub-accounts, a plain expense, and an other-expense account.
const line = (month: string, section: PnlLine["section"], externalId: string, accountName: string, position: number, amountCents: number, parentExternalId: string | null = null): PnlLine => ({
  month,
  section,
  externalId,
  parentExternalId,
  accountName,
  position,
  amountCents,
});

const JAN = "2026-01-01";
const FEB = "2026-02-01";
const lines: PnlLine[] = [
  line(JAN, "income", "1", "Services", 1, 1_000_00),
  line(FEB, "income", "1", "Services", 1, 1_200_00),
  line(FEB, "income", "2", "Pass Through Income", 2, 50_00),
  line(JAN, "expense", "10", "Contract Labor Costs", 3, 5_00),
  line(JAN, "expense", "11", "Staffing Contractor", 4, 600_00, "10"),
  line(FEB, "expense", "11", "Staffing Contractor", 4, 650_00, "10"),
  line(FEB, "expense", "12", "Operations Contractor", 5, 100_00, "10"),
  line(JAN, "expense", "20", "SaaS Applications", 6, 40_00),
  line(FEB, "other_expense", "30", "Exchange Gain or Loss", 7, 3_00),
  // Outside the months asked for: ignored.
  line("2025-12-01", "income", "1", "Services", 1, 9_999_00),
];

const byLabel = (label: string) => buildStatement(lines, [JAN, FEB]).find((r) => r.label === label);

describe("buildStatement", () => {
  it("prints the sections, sub-accounts and results in QuickBooks' order", () => {
    expect(buildStatement(lines, [JAN, FEB]).map((r) => `${"  ".repeat(r.depth)}${r.label}`)).toEqual([
      "Income",
      "  Services",
      "  Pass Through Income",
      "Total Income",
      "Gross Profit",
      "Expenses",
      "  Contract Labor Costs",
      "    Staffing Contractor",
      "    Operations Contractor",
      "  Total for Contract Labor Costs",
      "  SaaS Applications",
      "Total Expenses",
      "Net Operating Income",
      "Other Expenses",
      "  Exchange Gain or Loss",
      "Total Other Expenses",
      "Net Other Income",
      "Net Income",
    ]);
  });

  it("adds a parent's own amount to its sub-accounts", () => {
    expect(byLabel("Total for Contract Labor Costs")?.cents).toEqual([605_00, 750_00]);
  });

  it("sums every result from the accounts' own amounts", () => {
    expect(byLabel("Total Income")?.cents).toEqual([1_000_00, 1_250_00]);
    expect(byLabel("Total Expenses")?.cents).toEqual([645_00, 750_00]);
    expect(byLabel("Net Operating Income")?.cents).toEqual([355_00, 500_00]);
    expect(byLabel("Net Other Income")?.cents).toEqual([0, -3_00]);
    expect(byLabel("Net Income")?.cents).toEqual([355_00, 497_00]);
    expect(byLabel("Net Income")?.totalCents).toBe(852_00);
  });

  it("names an account as its latest month does", () => {
    const renamed = [...lines, line(FEB, "expense", "20", "Software", 6, 0)];
    const labels = buildStatement(renamed, [JAN, FEB]).map((r) => r.label);
    expect(labels).toContain("Software");
    expect(labels).not.toContain("SaaS Applications");
  });

  it("draws no section the company has no account in", () => {
    const labels = buildStatement(lines, [JAN, FEB]).map((r) => r.label);
    expect(labels).not.toContain("Cost of Goods Sold");
    expect(labels).not.toContain("Other Income");
  });
});

describe("monthsBetween", () => {
  it("counts every month across a year end, both ends included", () => {
    expect(monthsBetween("2025-11-15", "2026-02-03")).toEqual(["2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01"]);
  });
});
