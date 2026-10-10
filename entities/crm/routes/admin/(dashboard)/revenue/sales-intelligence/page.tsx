import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import { requirePermission } from "@/kernel/identity/access-request";
import { listCalls, scorecardAverage, type CallRow } from "@/entities/crm/lib/calls";
import { PageHead } from "@/kernel/ui/PageHead";
import { surfaceBase } from "@/kernel/shell/surface";
import { DataTable, type Column } from "@/kernel/ui/DataTable";
import { formatDate } from "@/kernel/ui/format";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";

export const metadata = {
  title: "Sales Intelligence",
  description: "Every recorded call, searchable by what was actually said, with coaching scorecards.",
};

const PAGE_SIZES = [25, 50, 100];

function fmtDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

function fmtRatio(r: number | null): string {
  return r == null ? "—" : `${Math.round(r * 100)}%`;
}

// List page: the sales call library. Only call_type 'sales' shows here; the
// full corpus (client syncs, 1-1s) stays queryable in the database. Search is
// full-text over transcript content, so "cash flow" finds the calls where the
// words were said, not just titled.
export default async function SalesIntelligencePage(props: { searchParams: Promise<SearchParamsObj> }) {
  const searchParams = await props.searchParams;
  const surface = await surfaceBase();
  await requirePermission("crm.calls");

  const page = Math.max(1, Number(firstParam(searchParams.page) ?? "1") || 1);
  const sizeParam = Number(firstParam(searchParams.size));
  const pageSize = PAGE_SIZES.includes(sizeParam) ? sizeParam : 25;
  const q = firstParam(searchParams.q) ?? "";

  const { rows, total, error } = await listCalls({ page, pageSize, search: q, type: "sales" });

  const columns: Column<CallRow>[] = [
    {
      key: "started_at",
      header: "Date",
      cell: (c) => (c.startedAt ? formatDate(c.startedAt) : <span className="admin-cell-muted">—</span>),
    },
    {
      key: "title",
      header: "Call",
      cell: (c) => (
        <Link className="admin-cell-strong" href={`/admin/revenue/sales-intelligence/${c.id}`}>
          {c.title}
        </Link>
      ),
    },
    {
      key: "duration",
      header: "Length",
      cell: (c) => <span className="admin-cell-muted">{fmtDuration(c.durationSeconds)}</span>,
    },
    {
      key: "talk_ratio",
      header: "Talk ratio",
      cell: (c) => <span className="admin-cell-muted">{fmtRatio(c.scorecard?.talkRatio ?? null)}</span>,
    },
    {
      key: "score",
      header: "Score",
      cell: (c) => {
        const avg = scorecardAverage(c.scorecard);
        if (avg == null) return <span className="admin-cell-muted">—</span>;
        const cls = avg >= 4 ? "admin-badge admin-badge--ok" : avg >= 3 ? "admin-badge admin-badge--warn" : "admin-badge admin-badge--err";
        return <span className={cls}>{avg.toFixed(1)} / 5</span>;
      },
    },
  ];

  return (
    <>
      <PageHead
        eyebrow="Revenue"
        title="Sales Intelligence"
        sub={`${total.toLocaleString()} sales call${total === 1 ? "" : "s"} on record, searchable by what was said`}
      />
      {error && <div className="admin-alert admin-alert--err u-mb-4">{error}</div>}
      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        pageSizeOptions={PAGE_SIZES}
        basePath={`${surface}/revenue/sales-intelligence`}
        searchParams={searchParams}
        searchPlaceholder="Search what was said, e.g. cash flow…"
        emptyText="No sales calls match."
      />
    </>
  );
}
