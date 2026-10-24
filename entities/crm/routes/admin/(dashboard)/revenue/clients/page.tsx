import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { DataTable, type Column } from "@/kernel/ui/DataTable";
import { Badge } from "@/kernel/ui/Badge";
import { INDUSTRY_CATEGORIES, SIZE_BANDS } from "@/entities/crm/lib/company-enums";
import { formatDate, humanize } from "@/kernel/ui/format";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { CompanyLinkRow, type CompanyRow } from "@/entities/crm/ui/CompanyRow";
import { ClientsActiveToggle } from "@/entities/crm/ui/ClientsActiveToggle";
import { listEntity, ClientCards } from "@/entities/company-os";
import { FilterBar } from "@/kernel/ui/FilterBar";
import { ClientRowActions } from "./ClientRowActions";
import { surfaceBase } from "@/kernel/shell/surface";
import { saigonToday } from "@/kernel/config/dates";
import { currentClientOrFilters } from "@/kernel/identity/client-status";

export const metadata = {
  title: "Clients",
  description: "Companies we currently serve as clients.",
};

// Revenue office: a client-focused view of the Companies list. Defaults to
// current clients (by client dates, kernel/identity/client-status.ts); the
// inactive toggle drops that filter to reveal every non-archived company.
type Company = CompanyRow;

const PAGE_SIZES = [25, 50, 100];
const SORTABLE = new Set(["name", "website_url", "industry_normalized", "size_band", "country", "priority", "created_at"]);

const PRIORITY_OPTIONS = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export default async function ClientsPage(props: { searchParams: Promise<SearchParamsObj> }) {
  await requirePermission("crm.pipeline");
  const searchParams = await props.searchParams;
  const surface = await surfaceBase();
  const basePath = `${surface}/revenue/clients`;
  const page = Math.max(1, Number(firstParam(searchParams.page) ?? "1") || 1);
  const sizeParam = Number(firstParam(searchParams.size));
  const pageSizeChoice = PAGE_SIZES.includes(sizeParam) ? sizeParam : 25;
  const q = firstParam(searchParams.q) ?? "";
  const sortParam = firstParam(searchParams.sort);
  const sort = sortParam && SORTABLE.has(sortParam) ? sortParam : "created_at";
  const dir = firstParam(searchParams.dir) === "asc" ? "asc" : "desc";
  const showInactive = firstParam(searchParams.inactive) === "1";
  const view = firstParam(searchParams.view) === "cards" ? "cards" : "list";
  const priorityParam = firstParam(searchParams.priority);
  const industryParam = firstParam(searchParams.industry);
  const bandParam = firstParam(searchParams.size_band);

  const filters: Record<string, string | number | boolean | null | (string | number)[]> = {};
  // Default: current clients only. Inactive view drops this to reveal non-clients.
  const today = saigonToday();
  const currentOnly = showInactive ? {} : { or: currentClientOrFilters(today) };
  if (priorityParam) filters.priority = priorityParam;
  if (industryParam && (INDUSTRY_CATEGORIES as readonly string[]).includes(industryParam)) {
    filters.industry_normalized = industryParam;
  }
  if (bandParam && (SIZE_BANDS as readonly string[]).includes(bandParam)) {
    filters.size_band = bandParam;
  }

  const { rows, total, pageSize, error } = await listEntity<Company>(
    "companies",
    "id, name, website_url, industry, industry_normalized, size_band, country, priority, archived_at, created_at",
    {
      page,
      pageSize: pageSizeChoice,
      search: q,
      searchColumns: ["name", "website_url"],
      sort,
      dir,
      excludeArchived: true,
      filters,
      ...currentOnly,
    },
  );

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
      cell: (r) => (r.priority ? <Badge>{humanize(r.priority)}</Badge> : <span className="admin-cell-muted">—</span>),
    },
    { key: "created_at", header: "Added", sortable: true, cell: (r) => formatDate(r.created_at) },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (r) => <ClientRowActions id={r.id} name={r.name} />,
    },
  ];

  return (
    <>
      <PageHead
        eyebrow="Revenue"
        title="Clients"
        sub={
          showInactive
            ? `${total.toLocaleString()} ${total === 1 ? "company" : "companies"} · including inactive`
            : `${total.toLocaleString()} active ${total === 1 ? "client" : "clients"}`
        }
        action={<ClientsActiveToggle basePath={basePath} searchParams={searchParams} showInactive={showInactive} />}
      />
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
        basePath={basePath}
        searchParams={searchParams}
        searchPlaceholder="Search name or website…"
        emptyText={showInactive ? "No companies match." : "No active clients match."}
        filterBar={
          <FilterBar
            basePath={basePath}
            searchParams={searchParams}
            filters={[
              { key: "industry", label: "Industry", options: INDUSTRY_CATEGORIES.map((c) => ({ value: c, label: c })) },
              { key: "size_band", label: "Size", options: SIZE_BANDS.map((b) => ({ value: b, label: b })) },
              { key: "priority", label: "Priority", options: PRIORITY_OPTIONS },
            ]}
          />
        }
        view={view}
        renderCards={(cardRows) => (
          <ClientCards
            rows={cardRows}
            detailBasePath={`${surface}/revenue/companies`}
            subText={(r) =>
              [r.industry_normalized || r.industry, r.priority ? humanize(r.priority) : null]
                .filter(Boolean)
                .join(" · ")
            }
          />
        )}
        renderRow={(row, cells) => <CompanyLinkRow row={row} hrefQuery="?from=clients">{cells}</CompanyLinkRow>}
      />
    </>
  );
}
