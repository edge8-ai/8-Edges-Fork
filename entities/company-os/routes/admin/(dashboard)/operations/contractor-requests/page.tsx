import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { companyOs } from "@/kernel/data/supabase";
import { listEntity } from "@/entities/company-os";
import { PageHead } from "@/kernel/ui/PageHead";
import { DataTable, type Column } from "@/kernel/ui/DataTable";
import { Badge } from "@/kernel/ui/Badge";
import { FilterBar } from "@/kernel/ui/FilterBar";
import { formatDate } from "@/kernel/ui/format";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import {
  WORK_REQUEST_STATUSES,
  WORK_REQUEST_STATUS_LABEL,
  workRequestTone,
  formatHours,
  type WorkRequestStatus,
} from "@/entities/company-os/lib/contractors";
import { REQUEST_SELECT, onePerson, oneCompany, type RequestRow } from "./request-shared";
import { withEstimateDeciders } from "./request-deciders";
import { RequestsShelfProvider, RequestShelfRow } from "./RequestsShelf";
import { legalName } from "@/kernel/config/people-name";

export const metadata = {
  title: "Work Requests",
  description: "Contractor work requests — estimate, approve, track, pay.",
};

const PAGE_SIZES = [25, 50, 100];
const SORTABLE = new Set(["title", "status", "created_at"]);

export default async function ContractorRequestsPage(props: { searchParams: Promise<SearchParamsObj> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("company-os.operations");
  const searchParams = await props.searchParams;
  const page = Math.max(1, Number(firstParam(searchParams.page) ?? "1") || 1);
  const sizeParam = Number(firstParam(searchParams.size));
  const pageSizeChoice = PAGE_SIZES.includes(sizeParam) ? sizeParam : 25;
  const q = firstParam(searchParams.q) ?? "";
  const sortParam = firstParam(searchParams.sort);
  const sort = sortParam && SORTABLE.has(sortParam) ? sortParam : "created_at";
  const dir = firstParam(searchParams.dir) === "asc" ? "asc" : "desc";
  const statusParam = firstParam(searchParams.status);

  const filters: Record<string, string> = {};
  if (statusParam && (WORK_REQUEST_STATUSES as readonly string[]).includes(statusParam)) {
    filters.status = statusParam;
  }
  const originParam = firstParam(searchParams.origin);
  if (originParam && ["admin", "portal"].includes(originParam)) {
    filters.origin = originParam;
  }

  const listed = await listEntity<RequestRow>(
    "contractor_work_requests",
    REQUEST_SELECT,
    {
      page,
      pageSize: pageSizeChoice,
      search: q,
      searchColumns: ["title", "brief"],
      sort,
      dir,
      filters,
    },
  );

  const { total, pageSize, error } = listed;
  const rows = await withEstimateDeciders(listed.rows);

  // ?open=<id> deep link (from the contractor shelf): fetch that request and
  // auto-open its drawer, whether or not it's on the current page of rows.
  const openId = firstParam(searchParams.open);
  let initialRow: RequestRow | null = null;
  if (openId && /^[0-9a-f-]{36}$/i.test(openId)) {
    const { data, error } = await companyOs
      .from("contractor_work_requests")
      .select(REQUEST_SELECT)
      .eq("id", openId)
      .maybeSingle();
    if (error) console.error("[contractor-requests] open request load failed:", error.message);
    initialRow = data ? (await withEstimateDeciders([data as unknown as RequestRow]))[0] : null;
  }

  const columns: Column<RequestRow>[] = [
    {
      key: "title",
      header: "Request",
      sortable: true,
      cell: (r) => <span className="admin-cell-strong">{r.title}</span>,
    },
    {
      key: "contractor",
      header: "Contractor",
      cell: (r) => legalName(onePerson(r.people), "—"),
    },
    {
      key: "origin",
      header: "Origin",
      cell: (r) =>
        r.origin === "portal" ? (
          <Badge tone="info">{oneCompany(r.client_company)?.name || "Portal"}</Badge>
        ) : (
          <span className="admin-cell-muted">Admin</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      cell: (r) => (
        <Badge tone={workRequestTone(r.status)}>
          {WORK_REQUEST_STATUS_LABEL[r.status as WorkRequestStatus] ?? r.status}
        </Badge>
      ),
    },
    {
      key: "estimated_hours",
      header: "Est.",
      align: "right",
      cell: (r) =>
        r.estimated_hours !== null ? (
          <span className="admin-cell-mono">{formatHours(r.estimated_hours)}</span>
        ) : (
          <span className="admin-cell-muted">—</span>
        ),
    },
    {
      key: "actual_hours",
      header: "Actual",
      align: "right",
      cell: (r) =>
        r.actual_hours !== null ? (
          <span className="admin-cell-mono">{formatHours(r.actual_hours)}</span>
        ) : (
          <span className="admin-cell-muted">—</span>
        ),
    },
    { key: "created_at", header: "Created", sortable: true, cell: (r) => formatDate(r.created_at) },
  ];

  return (
    <>
      <PageHead
        eyebrow="Operations"
        title="Work Requests"
        sub={`${total.toLocaleString()} ${total === 1 ? "request" : "requests"}`}
        action={
          <Link href="/admin/operations/contractor-requests/new" className="admin-btn admin-btn--primary">
            New request
          </Link>
        }
      />
      {error && <div className="admin-alert admin-alert--err u-mb-4">{error}</div>}
      <RequestsShelfProvider initialRow={initialRow}>
        <DataTable
          columns={columns}
          rows={rows}
          total={total}
          page={page}
          pageSize={pageSize}
          pageSizeOptions={PAGE_SIZES}
          sort={sort}
          dir={dir}
          basePath="/admin/operations/contractor-requests"
          searchParams={searchParams}
          searchPlaceholder="Search title or brief…"
          emptyText="No work requests yet."
          filterBar={
            <FilterBar
              basePath="/admin/operations/contractor-requests"
              searchParams={searchParams}
              filters={[
                {
                  key: "status",
                  label: "Status",
                  options: WORK_REQUEST_STATUSES.map((s) => ({
                    value: s,
                    label: WORK_REQUEST_STATUS_LABEL[s],
                  })),
                },
                {
                  key: "origin",
                  label: "Origin",
                  options: [
                    { value: "admin", label: "Admin" },
                    { value: "portal", label: "Portal (client)" },
                  ],
                },
              ]}
            />
          }
          renderRow={(row, cells) => <RequestShelfRow row={row}>{cells}</RequestShelfRow>}
        />
      </RequestsShelfProvider>
    </>
  );
}
