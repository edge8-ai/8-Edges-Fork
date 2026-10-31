import { qboFetch, type QboEntity } from "@/entities/company-os/lib/qbo";
import type { PnlLine, PnlSection } from "@/entities/finance";

// QuickBooks' Profit and Loss report, one column per month, on the accrual
// basis: the same report the accountant runs by hand as "Profit and Loss by
// Month". Server-only, through the connection layer in ./qbo.ts. The parse is
// separate from the fetch so it is tested on a report's JSON without a
// network.

type ColData = { value?: string; id?: string };
type ReportRow = {
  type?: string;
  group?: string;
  ColData?: ColData[];
  Header?: { ColData?: ColData[] };
  Rows?: { Row?: ReportRow[] };
};
type ReportColumn = { ColType?: string; ColTitle?: string; MetaData?: { Name?: string; Value?: string }[] };
export type PnlReport = {
  Header?: { Currency?: string };
  Columns?: { Column?: ReportColumn[] };
  Rows?: { Row?: ReportRow[] };
};

// The report's top-level groups that hold accounts. Gross Profit, Net
// Operating Income and the other results are sums; the statement rebuilds
// them from the accounts, so they are not read.
const SECTION_OF_GROUP: Record<string, PnlSection> = {
  Income: "income",
  COGS: "cogs",
  Expenses: "expense",
  OtherIncome: "other_income",
  OtherExpenses: "other_expense",
};

/** QuickBooks' amount text in cents: "" is no activity, "-12.50" a credit. */
function cents(value: string | undefined): number {
  if (!value) return 0;
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/**
 * Every account of the report as one line per month column, the months' first
 * days taken from each column's StartDate. An account QuickBooks gives no id
 * (rare: an unassigned bucket) is keyed by its name. A parent account's own
 * amount is on its section's header row; its sub-accounts follow under it.
 */
export function parsePnlReport(report: PnlReport): { lines: PnlLine[]; currency: string } {
  const columns = report.Columns?.Column ?? [];
  const months: { index: number; month: string }[] = [];
  columns.forEach((c, index) => {
    const meta = (name: string) => c.MetaData?.find((m) => m.Name === name)?.Value;
    const start = meta("StartDate");
    // The last column is the range's Total, which is a sum and not a month.
    if (index > 0 && c.ColType === "Money" && start && meta("ColKey") !== "total") {
      months.push({ index, month: `${start.slice(0, 7)}-01` });
    }
  });

  const lines: PnlLine[] = [];
  let position = 0;
  const emit = (cols: ColData[] | undefined, section: PnlSection, parent: string | null): string | null => {
    const name = cols?.[0]?.value?.trim();
    if (!name) return null;
    const externalId = cols?.[0]?.id ?? `name:${name}`;
    position += 1;
    for (const { index, month } of months) {
      lines.push({
        month,
        section,
        externalId,
        parentExternalId: parent,
        accountName: name,
        position,
        amountCents: cents(cols?.[index]?.value),
      });
    }
    return externalId;
  };

  const walk = (rows: ReportRow[] | undefined, section: PnlSection, parent: string | null) => {
    for (const row of rows ?? []) {
      if (row.type === "Data") emit(row.ColData, section, parent);
      else if (row.type === "Section") {
        // A section inside a section is a parent account: its header carries
        // its own amounts, and its rows are its sub-accounts.
        const id = emit(row.Header?.ColData, section, parent);
        walk(row.Rows?.Row, section, id ?? parent);
      }
    }
  };

  for (const top of report.Rows?.Row ?? []) {
    const section = top.group ? SECTION_OF_GROUP[top.group] : undefined;
    if (section) walk(top.Rows?.Row, section, null);
  }
  return { lines, currency: report.Header?.Currency ?? "USD" };
}

/** The report for one QuickBooks company, every month from `from` to `to` (YYYY-MM-DD). */
export async function fetchQboPnl(
  entity: QboEntity,
  from: string,
  to: string,
): Promise<{ ok: true; lines: PnlLine[]; currency: string } | { ok: false; error: string }> {
  const query = new URLSearchParams({
    start_date: from,
    end_date: to,
    summarize_column_by: "Month",
    accounting_method: "Accrual",
  });
  const res = await qboFetch(`/reports/ProfitAndLoss?${query}`, { method: "GET" }, entity);
  if (!res.ok) return res;
  return { ok: true, ...parsePnlReport(res.json as PnlReport) };
}
