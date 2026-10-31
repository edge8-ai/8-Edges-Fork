import type { ReactNode } from "react";
import Link from "next/link";
import { requirePermission } from "@/kernel/identity/access-request";
import { mayProp } from "@/kernel/identity/may-prop";
import { PageHead } from "@/kernel/ui/PageHead";
import { formatCents, formatDate } from "@/kernel/ui/format";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { saigonToday } from "@/kernel/config/dates";
import { buildStatement, monthsBetween, pnlLastSyncedAt, pnlLinesSince, type StatementRow } from "@/entities/finance";
import { PnlSyncButton } from "./PnlSyncButton";

export const metadata = {
  title: "P&L",
  description: "The monthly Profit and Loss from QuickBooks, every account by month.",
};

// /team/finance/pnl: the monthly P&L mirrored from QuickBooks, laid out like
// its "Profit and Loss by Month" report, one year at a time. Company finances
// are Super Admin's (finance.pnl; Dave, 2026-10-24).

// The first year the sync reads (PNL_SINCE in company-os).
const FIRST_YEAR = 2024;

export default async function PnlPage(props: { searchParams: Promise<SearchParamsObj> }) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("finance.pnl");
  const may = mayProp(access, ["finance.pnl"]);

  const today = saigonToday();
  const thisYear = Number(today.slice(0, 4));
  const asked = Number(firstParam((await props.searchParams).year));
  const year = asked >= FIRST_YEAR && asked <= thisYear ? asked : thisYear;
  const months = monthsBetween(`${year}-01-01`, year === thisYear ? today : `${year}-12-01`);

  const [lines, syncedAt] = await Promise.all([pnlLinesSince("edge8", months[0]), pnlLastSyncedAt("edge8")]);
  // The read runs to today, so a past year filters to its own months.
  const inYear = lines.filter((l) => l.month.startsWith(String(year)));
  const rows = buildStatement(inYear, months);
  const years = Array.from({ length: thisYear - FIRST_YEAR + 1 }, (_, i) => thisYear - i);

  return (
    <>
      <PageHead
        title="P&L"
        sub={`Profit and Loss by month from QuickBooks, accrual basis. ${syncedAt ? `Synced ${formatDate(syncedAt)}.` : "Not synced yet."}`}
        action={<PnlSyncButton may={may} />}
      />

      <div className="u-row u-gap-2 u-mb-3">
        {years.map((y) => (
          <Link key={y} href={`/team/finance/pnl?year=${y}`} className={`admin-chip${y === year ? " admin-chip--accent" : ""}`}>
            {y}
          </Link>
        ))}
      </div>

      {inYear.length === 0 ? (
        <div className="admin-empty">No P&amp;L for {year} yet. Sync now reads it from QuickBooks.</div>
      ) : (
        <div className="admin-table-wrap">
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Account</th>
                  {months.map((m) => (
                    <th key={m} className="u-right u-nowrap">
                      {new Date(`${m}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}
                    </th>
                  ))}
                  <th className="u-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <StatementLine key={i} row={r} span={months.length + 2} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function StatementLine({ row, span }: { row: StatementRow; span: number }) {
  if (row.kind === "heading") {
    return (
      <tr className="admin-table-group-row">
        <td colSpan={span}>{row.label}</td>
      </tr>
    );
  }
  const strong = row.kind !== "account";
  const cell = `admin-cell-mono u-right u-nowrap${strong ? " admin-cell-strong" : ""}`;
  return (
    <tr>
      <td className={`u-nowrap${strong ? " admin-cell-strong" : ""}`}>
        <Indent depth={row.depth}>{row.label}</Indent>
      </td>
      {(row.cents ?? []).map((c, i) => (
        <td key={i} className={cell}>
          {c === 0 && row.kind === "account" ? "" : formatCents(c)}
        </td>
      ))}
      <td className={cell}>{formatCents(row.totalCents)}</td>
    </tr>
  );
}

// Sub-accounts sit under their parent, as QuickBooks indents them: one padded
// span per level, so any depth indents without an inline style.
function Indent({ depth, children }: { depth: number; children: ReactNode }) {
  return depth > 0 ? (
    <span className="u-pl-4">
      <Indent depth={depth - 1}>{children}</Indent>
    </span>
  ) : (
    <>{children}</>
  );
}
