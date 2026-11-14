import Link from "next/link";
import { requirePermission } from "@/kernel/identity/access-request";
import { mayOpen } from "@/kernel/identity/may-open";
import { mustRows } from "@/kernel/data/read";
import { saigonToday } from "@/kernel/config/dates";
import { formatCents } from "@/kernel/ui/format";
import { loadFlow } from "@/entities/boards";
import { getLastMeetingsForCompanies } from "@/entities/crm";
import { overdueInvoicesOf } from "@/entities/finance";
import { portfolio, type PortfolioStatus } from "@/entities/company-os/lib/client-portfolio";
import { ClientPortfolio } from "@/entities/company-os/ui/ClientPortfolio";
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

// Client Hubs (AH.6) opens on a card per active client: how each is doing and
// the one next thing to do (lib/client-portfolio.ts), the ones that need the
// reader first. The launcher table it used to open on is ?view=list.
//
// The table lists clients by name (or as cards, ?view=cards from its switch). Opening one lands on that company's 360, which defaults to the
// Client Hub tab for clients, so the board / roadmap / documents / meetings /
// team are front and centre. The Active/Inactive filter is driven by
// metadata.client_hub_active and defaults to active clients. The list is small
// (tens of rows), so search, sort and paging happen here after one fetch.
export default async function ClientHubsPage(props: { searchParams: Promise<SearchParamsObj> }) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("company-os.clients");
  const searchParams = await props.searchParams;
  const status = parseStatus(firstParam(searchParams.status));
  const rawView = firstParam(searchParams.view);
  const view = rawView === "cards" ? "cards" : "list";
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

  if (!rawView) return <Portfolio access={access} clients={all.filter((r) => r.hubActive)} inactive={counts.inactive} q={q} show={firstParam(searchParams.show)} />;

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
        eyebrow="Edges"
        title="Client Hubs"
        sub={`${matched.length} ${noun}${matched.length === 1 ? "" : "s"}. Open one to work their hub.`}
        action={
          <Link href={BASE_PATH} className="admin-btn admin-btn--sm">
            How each is doing
          </Link>
        }
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

const SHOWS: PortfolioStatus[] = ["needs", "ok", "quiet"];
const SHOW_WORD: Record<PortfolioStatus, string> = { needs: "Needs you", ok: "On track", quiet: "Quiet" };

// The cards (AH.6). Each source (boards, invoices, meetings) is read only for
// a reader who may open the page that owns it, so the hub never shows a figure
// to someone who could not see it there (client-hubs/page.test.tsx); a failed
// read fails the page rather than drawing a client as fine.
async function Portfolio({ access, clients, inactive, q, show }: { access: Awaited<ReturnType<typeof requirePermission>>; clients: Row[]; inactive: number; q: string; show: string | undefined }) {
  const today = saigonToday();
  const ids = clients.map((c) => c.id);
  const [flow, met, invoices] = await Promise.all([
    mayOpen(access, "/admin/edges/workboard") ? loadFlow() : null,
    mayOpen(access, "/admin/revenue/meetings") ? getLastMeetingsForCompanies(ids) : new Map<string, { date: string }>(),
    mayOpen(access, "/admin/revenue/invoices") && ids.length ? overdueInvoicesOf(ids, today).then((r) => mustRows(r, "[client-hubs] overdue invoices")) : [],
  ]);
  const cards = portfolio(
    clients.map((c) => ({
      id: c.id,
      name: c.name || "(no name)",
      programs: c.programs,
      boards: (flow?.perBoard ?? []).filter((b) => b.clientCompanyId === c.id),
      lastMet: met.get(c.id)?.date ?? null,
      overdueInvoices: (invoices as { id: string; company_id: string; doc_number: string | null; due_date: string; currency: string | null; balance_cents: number }[])
        .filter((i) => i.company_id === c.id)
        .map((i) => ({ id: i.id, docNumber: i.doc_number, dueDate: i.due_date, balance: formatCents(i.balance_cents, i.currency ?? "usd") })),
    })),
    today,
  );
  const count = (s: PortfolioStatus) => cards.filter((c) => c.status === s).length;
  const filter = SHOWS.find((s) => s === show) ?? null;
  const shown = cards.filter((c) => (!filter || c.status === filter) && (!q || c.name.toLowerCase().includes(q)));
  const sentence = `${cards.length} active clients. ${count("needs")} need you, ${count("ok")} on track, ${count("quiet")} ${count("quiet") === 1 ? "has" : "have"} gone quiet.`;

  return (
    <div>
      <PageHead
        eyebrow="Edges"
        title="Client Hubs"
        sub={sentence}
        action={
          <Link href={`${BASE_PATH}?view=list`} className="admin-btn admin-btn--sm">
            List
          </Link>
        }
      />
      <div className="wb-stuck-chips">
        <Link href={BASE_PATH} className={`admin-chip${!filter ? " is-active" : ""}`}>
          All {cards.length}
        </Link>
        {SHOWS.map((s) => (
          <Link key={s} href={`${BASE_PATH}?show=${s}`} className={`admin-chip${filter === s ? " is-active" : ""}`}>
            {SHOW_WORD[s]} {count(s)}
          </Link>
        ))}
        <Link href={`${BASE_PATH}?view=list&status=inactive`} className="admin-chip">
          Inactive {inactive}
        </Link>
      </div>
      <ClientPortfolio cards={shown} />
    </div>
  );
}
