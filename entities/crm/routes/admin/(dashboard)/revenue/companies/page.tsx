import { requirePermission } from "@/kernel/identity/access-request";
import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import { PageHead } from "@/kernel/ui/PageHead";
import { surfaceBase } from "@/kernel/shell/surface";
import { DataTable, type Column } from "@/kernel/ui/DataTable";
import { Badge } from "@/kernel/ui/Badge";
import { getCompaniesSummary } from "@/entities/crm/lib/company-summary";
import { INDUSTRY_CATEGORIES, SIZE_BANDS } from "@/entities/crm/lib/company-enums";
import { formatDate, humanize } from "@/kernel/ui/format";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { listEntity } from "@/entities/company-os";
import { ArchivedToggle } from "@/kernel/ui/ArchivedToggle";
import { FilterBar } from "@/kernel/ui/FilterBar";
import { BarChart } from "@/kernel/ui/charts/BarChart";
import { DonutChart } from "@/kernel/ui/charts/DonutChart";
import { CompanyLinkRow, type CompanyRow } from "@/entities/crm/ui/CompanyRow";

export const metadata = {
  title: "Companies",
  description: "Organizations tracked in the Company Database.",
};

// Revenue office: companies (accounts). Spine-level, brand-agnostic.
type Company = CompanyRow;

const PAGE_SIZES = [25, 50, 100];
const SORTABLE = new Set(["name", "website_url", "industry_normalized", "size_band", "country", "priority", "created_at"]);

const PRIORITY_OPTIONS = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export default async function CompaniesPage(props: { searchParams: Promise<SearchParamsObj> }) {
  await requirePermission("crm.pipeline");
  const searchParams = await props.searchParams;
  const surface = await surfaceBase();
  const page = Math.max(1, Number(firstParam(searchParams.page) ?? "1") || 1);
  const sizeParam = Number(firstParam(searchParams.size));
  const pageSizeChoice = PAGE_SIZES.includes(sizeParam) ? sizeParam : 25;
  const q = firstParam(searchParams.q) ?? "";
  const sortParam = firstParam(searchParams.sort);
  const sort = sortParam && SORTABLE.has(sortParam) ? sortParam : "created_at";
  const dir = firstParam(searchParams.dir) === "asc" ? "asc" : "desc";
  const showArchived = firstParam(searchParams.archived) === "1";
  const priorityParam = firstParam(searchParams.priority);
  const industryParam = firstParam(searchParams.industry);
  const bandParam = firstParam(searchParams.size_band);

  const filters: Record<string, string | number | boolean | null> = {};
  if (priorityParam) filters.priority = priorityParam;
  if (industryParam && (INDUSTRY_CATEGORIES as readonly string[]).includes(industryParam)) {
    filters.industry_normalized = industryParam;
  }
  if (bandParam && (SIZE_BANDS as readonly string[]).includes(bandParam)) {
    filters.size_band = bandParam;
  }

  const [{ rows, total, pageSize, error }, summary] = await Promise.all([
    listEntity<Company>(
      "companies",
      "id, name, website_url, industry, industry_normalized, size_band, country, priority, archived_at, created_at",
      {
        page,
        pageSize: pageSizeChoice,
        search: q,
        searchColumns: ["name", "website_url"],
        sort,
        dir,
        excludeArchived: !showArchived,
        filters,
      },
    ),
    getCompaniesSummary(),
  ]);

  const columns: Column<Company>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      cell: (r) => <span className="admin-cell-strong">{r.name || "(no name)"}</span>,
    },
    { key: "website_url", header: "Website URL", sortable: true, cell: (r) => <span className="admin-cell-muted">{r.website_url || "—"}</span> },
    {
      key: "industry_normalized",
      header: "Industry",
      sortable: true,
      cell: (r) => r.industry_normalized || r.industry || <span className="admin-cell-muted">—</span>,
    },
    { key: "size_band", header: "Size", sortable: true, cell: (r) => r.size_band || <span className="admin-cell-muted">—</span> },
    { key: "country", header: "Country", sortable: true, cell: (r) => r.country || <span className="admin-cell-muted">—</span> },
    {
      key: "priority",
      header: "Priority",
      sortable: true,
      cell: (r) => (
        <span className="u-row">
          {r.archived_at && <Badge tone="neutral">Archived</Badge>}
          {r.priority ? <Badge>{humanize(r.priority)}</Badge> : !r.archived_at ? <span className="admin-cell-muted">—</span> : null}
        </span>
      ),
    },
    { key: "created_at", header: "Added", sortable: true, cell: (r) => formatDate(r.created_at) },
  ];

  return (
    <>
      <PageHead
        eyebrow="Revenue"
        title="Companies"
        sub={`${total.toLocaleString()} ${total === 1 ? "company" : "companies"}${showArchived ? " · showing archived" : ""}`}
        action={
          <ArchivedToggle basePath={`${surface}/revenue/companies`} searchParams={searchParams} showArchived={showArchived} />
        }
      />
      {summary && (
        <div className="admin-summary">
          <div className="admin-summary-pills">
            <div className="admin-pill">
              <span className="admin-pill-label">Companies</span>
              <span className="admin-pill-val">{summary.total.toLocaleString()}</span>
            </div>
            <Link href="/admin/revenue/deals" className="admin-pill">
              <span className="admin-pill-label">Active Deals</span>
              <span className="admin-pill-val">{summary.withActiveDeals.toLocaleString()}</span>
            </Link>
            <div className="admin-pill">
              <span className="admin-pill-label">Clients</span>
              <span className="admin-pill-val">{summary.clients.toLocaleString()}</span>
            </div>
          </div>
          <div className="admin-summary-grid">
            <div className="admin-card admin-chart-card">
              <div className="admin-kpi-label">By industry</div>
              <DonutChart
                data={summary.industries}
                centerLabel="companies"
                ariaLabel="Companies by industry category"
                neutralLabel="Uncategorized"
                emptyText="Industry data pending enrichment."
              />
            </div>
            <div className="admin-card admin-chart-card">
              <div className="admin-kpi-label">By country</div>
              <DonutChart
                data={summary.countries}
                centerLabel="companies"
                ariaLabel="Companies by country"
                neutralLabel="Unknown"
                emptyText="Country data pending enrichment."
              />
            </div>
            <div className="admin-card admin-chart-card">
              <div className="admin-kpi-label">By size (employees)</div>
              <BarChart
                data={summary.sizeBands}
                ariaLabel="Companies by employee-size band"
                emptyText="Size data pending enrichment."
              />
            </div>
          </div>
        </div>
      )}
      {error && <div className="admin-alert admin-alert--err u-mb-4">{error}</div>}
      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        pageSizeOptions={PAGE_SIZES}
        sort={sort}
        dir={dir}
        basePath={`${surface}/revenue/companies`}
        searchParams={searchParams}
        searchPlaceholder="Search name or website…"
        emptyText="No companies match."
        filterBar={
          <FilterBar
            basePath={`${surface}/revenue/companies`}
            searchParams={searchParams}
            filters={[
              { key: "industry", label: "Industry", options: INDUSTRY_CATEGORIES.map((c) => ({ value: c, label: c })) },
              { key: "size_band", label: "Size", options: SIZE_BANDS.map((b) => ({ value: b, label: b })) },
              { key: "priority", label: "Priority", options: PRIORITY_OPTIONS },
            ]}
          />
        }
        renderRow={(row, cells) => <CompanyLinkRow row={row}>{cells}</CompanyLinkRow>}
      />
    </>
  );
}
