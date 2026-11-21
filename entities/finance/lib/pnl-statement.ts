// The P&L statement, built from the stored account lines the way QuickBooks
// prints its "Profit and Loss by Month" report: each section's accounts with
// their sub-accounts, a "Total for" row under every parent, the section totals,
// and Gross Profit, Net Operating Income, Net Other Income and Net Income.
// Nothing here is stored: every total is a sum of the accounts' own amounts,
// which is what keeps the page equal to QuickBooks. Pure, so it is tested
// without a database.

export type PnlSection = "income" | "cogs" | "expense" | "other_income" | "other_expense";

/** One account's own amount in one month, as the sync stored it. */
export type PnlLine = {
  month: string;
  section: PnlSection;
  externalId: string;
  parentExternalId: string | null;
  accountName: string;
  position: number;
  amountCents: number;
};

export type StatementRow = {
  kind: "heading" | "account" | "subtotal" | "total" | "result";
  label: string;
  /** How far the label is indented: 0 for a section, 1 for its accounts, more for sub-accounts. */
  depth: number;
  /** One amount per month, in the order of the months passed in; null on a heading. */
  cents: number[] | null;
  /** The sum across those months; null on a heading. */
  totalCents: number | null;
};

const SECTIONS: { section: PnlSection; heading: string; total: string }[] = [
  { section: "income", heading: "Income", total: "Total Income" },
  { section: "cogs", heading: "Cost of Goods Sold", total: "Total Cost of Goods Sold" },
  { section: "expense", heading: "Expenses", total: "Total Expenses" },
  { section: "other_income", heading: "Other Income", total: "Total Other Income" },
  { section: "other_expense", heading: "Other Expenses", total: "Total Other Expenses" },
];

type Account = { id: string; name: string; parent: string | null; position: number; cents: number[] };

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const add = (a: number[], b: number[]) => a.map((x, i) => x + b[i]);
const minus = (a: number[], b: number[]) => a.map((x, i) => x - b[i]);
const valued = (kind: StatementRow["kind"], label: string, depth: number, cents: number[]): StatementRow => ({
  kind,
  label,
  depth,
  cents,
  totalCents: sum(cents),
});

/**
 * The statement for these months (each the first day of a month, in the order
 * the columns read). Lines outside the months are ignored. A section with no
 * account is left out, as QuickBooks leaves out an empty Cost of Goods Sold.
 */
export function buildStatement(lines: PnlLine[], months: string[]): StatementRow[] {
  const column = new Map(months.map((m, i) => [m.slice(0, 10), i]));
  const zero = () => months.map(() => 0);

  const bySection = new Map<PnlSection, Map<string, Account>>();
  for (const line of lines) {
    const i = column.get(line.month.slice(0, 10));
    if (i === undefined) continue;
    const accounts = bySection.get(line.section) ?? new Map<string, Account>();
    bySection.set(line.section, accounts);
    const account = accounts.get(line.externalId) ?? {
      id: line.externalId,
      name: line.accountName,
      parent: line.parentExternalId,
      position: line.position,
      cents: zero(),
    };
    // The latest month's name and place win, so a renamed or moved account
    // reads as it does in QuickBooks today.
    account.name = line.accountName;
    account.parent = line.parentExternalId;
    account.position = line.position;
    account.cents[i] += line.amountCents;
    accounts.set(line.externalId, account);
  }

  const rows: StatementRow[] = [];
  const sectionTotal = new Map<PnlSection, number[]>();
  for (const { section, heading, total } of SECTIONS) {
    const accounts = bySection.get(section);
    if (!accounts || accounts.size === 0) continue;
    const children = new Map<string | null, Account[]>();
    for (const a of accounts.values()) {
      // A parent outside this section (not expected) leaves the account at the top.
      const parent = a.parent && accounts.has(a.parent) ? a.parent : null;
      children.set(parent, [...(children.get(parent) ?? []), a]);
    }
    for (const list of children.values()) list.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));

    // Writes one account and everything under it, and returns their sum.
    const walk = (a: Account, depth: number): number[] => {
      const kids = children.get(a.id) ?? [];
      rows.push(valued("account", a.name, depth, a.cents));
      if (kids.length === 0) return a.cents;
      const subtree = kids.reduce((acc, k) => add(acc, walk(k, depth + 1)), a.cents);
      rows.push(valued("subtotal", `Total for ${a.name}`, depth, subtree));
      return subtree;
    };

    rows.push({ kind: "heading", label: heading, depth: 0, cents: null, totalCents: null });
    const cents = (children.get(null) ?? []).reduce((acc, a) => add(acc, walk(a, 1)), zero());
    rows.push(valued("total", total, 0, cents));
    sectionTotal.set(section, cents);

    const of = (s: PnlSection) => sectionTotal.get(s) ?? zero();
    if (section === "cogs" || (section === "income" && !bySection.get("cogs")?.size)) {
      rows.push(valued("result", "Gross Profit", 0, minus(of("income"), of("cogs"))));
    }
  }

  const of = (s: PnlSection) => sectionTotal.get(s) ?? zero();
  const operating = minus(minus(of("income"), of("cogs")), of("expense"));
  const other = minus(of("other_income"), of("other_expense"));
  // Net Operating Income sits after Expenses; Net Other Income after the other sections.
  const afterExpenses = rows.findIndex((r) => r.kind === "total" && r.label === "Total Expenses");
  const operatingRow = valued("result", "Net Operating Income", 0, operating);
  if (afterExpenses === -1) rows.push(operatingRow);
  else rows.splice(afterExpenses + 1, 0, operatingRow);
  if (sectionTotal.has("other_income") || sectionTotal.has("other_expense")) {
    rows.push(valued("result", "Net Other Income", 0, other));
  }
  rows.push(valued("result", "Net Income", 0, add(operating, other)));
  return rows;
}

/** The first day of every month from `from` through `to`, both "YYYY-MM-..." strings. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const endY = Number(to.slice(0, 4));
  const endM = Number(to.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, "0")}-01`);
    m += 1;
    if (m === 13) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
