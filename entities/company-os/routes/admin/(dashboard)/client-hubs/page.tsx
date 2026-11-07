import { requirePermission } from "@/kernel/identity/access-request";
import { companyOs } from "@/kernel/data/supabase";
import { HAS_CLIENT_DATES_FILTER } from "@/kernel/identity/client-status";
import { PageHead } from "@/kernel/ui/PageHead";
import { DataTable, type Column } from "@/kernel/ui/DataTable";
import { Badge } from "@/kernel/ui/Badge";
import { ClientCards } from "@/entities/company-os/ui/ClientCards";
import { countActiveProgramsByCompany } from "@/entities/portal";
import { CompanyLinkRow, type CompanyRow } from "@/entities/crm";
import { humanize } from "@/kernel/ui/format";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { ClientHubFilter, type HubStatus } from "./ClientHubFilter";

export const metadata = {
  title: "Client Hubs",
  description: "Pick a client to open their hub: work board, roadmap, documents, meetings, and team.",
};

const DEFAULT_STATUS: HubStatus = "active";
const BASE_PATH = "/admin/client-hubs";
const PAGE_SIZE = 50;
const SORTABLE = new Set(["name", "industry", "priority", "programs"]);

function parseStatus(value: string | undefined): HubStatus {
  return value === "inactive" || value === "all" ? value : DEFAULT_STATUS;
}

type Row = CompanyRow & {
  metadata: { client_hub_active?: boolean } | null;
  programs: number;
  hubActive: boolean;
};

const subText = (r: Row) =>
  [r.industry_normalized || r.industry, r.priority ? humanize(r.priority) : null].filter(Boolean).join(" · ");

// Client Hubs: a launcher that lists clients as a table (default) or as cards
// (?view=cards). Opening one lands on that company's 360, which defaults to the
// Client Hub tab for clients, so the board / roadmap / documents / meetings /
// team are front and centre. The Active/Inactive filter is driven by
// metadata.client_hub_active and defaults to active clients. The list is small
// (tens of rows), so search, sort and paging happen here after one fetch.
export default async function ClientHubsPage(props: { searchParams: Promise<SearchParamsObj> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("company-os.clients");
  const searchParams = await props.searchParams;
  const status = parseStatus(firstParam(searchParams.status));
  const view = firstParam(searchParams.view) === "cards" ? "cards" : "list";
  const q = (firstParam(searchParams.q) ?? "").trim().toLowerCase();
  const sortParam = firstParam(searchParams.sort);
  const sort = sortParam && SORTABLE.has(sortParam) ? sortParam : "name";
  const dir: "asc" | "desc" = firstParam(searchParams.dir) === "desc" ? "desc" : "asc";
  const page = Math.max(1, Number(firstParam(searchParams.page) ?? "1") || 1);

  const [{ data, error }, programCounts] = await Promise.all([
    companyOs
      .from("companies")
      .select("id, name, website_url, industry, industry_normalized, size_band, country, priority, archived_at, created_at, metadata")
      // Current and former clients (a former client keeps its hub and portal),
      // plus any company whose hub is switched on without client dates, since
      // the operator's own companies run their boards here too.
      .or(`${HAS_CLIENT_DATES_FILTER},metadata->>client_hub_active.eq.true`)
      .is("archived_at", null)
      .order("name", { ascending: true }),
    countActiveProgramsByCompany(),
  ]);
  if (error) {
    return (
      <div>
        <PageHead eyebrow="Operating System" title="Client Hubs" />
        <div className="admin-card admin-section-card">
          <p className="admin-page-sub u-m-0">Couldn&apos;t load clients: {error.message}</p>
        </div>
      </div>
    );
  }

  const all: Row[] = (data ?? []).map((r) => ({
    ...(r as Omit<Row, "programs" | "hubActive">),
    programs: programCounts.get(r.id) ?? 0,
    hubActive: (r.metadata as Row["metadata"])?.client_hub_active === true,
  }));

  const counts: Record<HubStatus, number> = {
    active: all.filter((r) => r.hubActive).length,
    inactive: all.filter((r) => !r.hubActive).length,
    all: all.length,
  };

  const byStatus =
    status === "all" ? all : status === "inactive" ? all.filter((r) => !r.hubActive) : all.filter((r) => r.hubActive);
  const matched = q
    ? byStatus.filter((r) => [r.name, r.industry_normalized, r.industry].some((v) => v?.toLowerCase().includes(q)))
    : byStatus;

  const sortKey = (r: Row): string | number =>
    sort === "programs" ? r.programs : sort === "industry" ? (r.industry_normalized || r.industry || "") : ((r as Record<string, unknown>)[sort] as string | null) ?? "";
  const sorted = [...matched].sort((a, b) => {
    const x = sortKey(a);
    const y = sortKey(b);
    const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return dir === "desc" ? -cmp : cmp;
  });
  const rows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const noun = status === "all" ? "client" : `${status} client`;

  const columns: Column<Row>[] = [
    { key: "name", header: "Client", sortable: true, cell: (r) => <strong>{r.name || "(no name)"}</strong> },
    {
      key: "industry",
      header: "Industry",
      sortable: true,
      cell: (r) => r.industry_normalized || r.industry || <span className="admin-cell-muted">—</span>,
    },
    {
      key: "priority",
      header: "Priority",
      sortable: true,
      cell: (r) => (r.priority ? <Badge>{humanize(r.priority)}</Badge> : <span className="admin-cell-muted">—</span>),
    },
    { key: "programs", header: "AI Programs", sortable: true, align: "right", className: "admin-cell-mono", cell: (r) => r.programs },
    {
      key: "hub",
      header: "Hub",
      cell: (r) => <Badge tone={r.hubActive ? "ok" : "neutral"}>{r.hubActive ? "Active" : "Inactive"}</Badge>,
    },
  ];

  return (
    <div>
      <PageHead
        eyebrow="Operating System"
        title="Client Hubs"
        sub={`${matched.length} ${noun}${matched.length === 1 ? "" : "s"}. Open one to work their hub.`}
      />
      <DataTable
        columns={columns}
        rows={rows}
        total={matched.length}
        page={page}
        pageSize={PAGE_SIZE}
        sort={sort}
        dir={dir}
        basePath={BASE_PATH}
        searchParams={searchParams}
        searchPlaceholder="Search clients…"
        emptyText={`No ${noun}s.`}
        filterBar={<ClientHubFilter active={status} defaultStatus={DEFAULT_STATUS} counts={counts} searchParams={searchParams} />}
        view={view}
        renderCards={(cards) => (
          <ClientCards rows={cards} detailBasePath="/admin/revenue/companies" hrefQuery="?from=client-hubs" subText={subText} />
        )}
        renderRow={(row, cells) => (
          <CompanyLinkRow row={row} hrefQuery="?from=client-hubs">
            {cells}
          </CompanyLinkRow>
        )}
      />
    </div>
  );
}
