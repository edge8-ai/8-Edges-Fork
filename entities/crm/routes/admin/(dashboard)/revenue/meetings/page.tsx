import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import { requirePermission } from "@/kernel/identity/access-request";
import { mayProp } from "@/kernel/identity/may-prop";
import { listMeetings, listClientCompanies, listCompanyOptions, type AdminMeetingRow } from "@/entities/crm/lib/meetings";
import { LarkMeetingLinkForm } from "@/entities/crm/ui/LarkMeetingLinkForm";
import { PageHead } from "@/kernel/ui/PageHead";
import { surfaceBase } from "@/kernel/shell/surface";
import { DataTable, type Column } from "@/kernel/ui/DataTable";
import { FilterBar } from "@/kernel/ui/FilterBar";
import { MeetingStatusBadges } from "@/entities/crm/ui/MeetingsTable";
import { formatDate } from "@/kernel/ui/format";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";

export const metadata = {
  title: "Client Meetings",
  description: "Every client meeting on record, across all clients.",
};

const PAGE_SIZES = [25, 50, 100];

// List page. One row per meeting across every client; the summary and the raw
// transcript live on the Details page, uploading lives on the Add New page.
// Pasting a Lark Minutes link lives here (Z.5), because it needs nothing but
// the link, the client and the type.
export default async function MeetingsPage(props: { searchParams: Promise<SearchParamsObj> }) {
  const searchParams = await props.searchParams;
  const surface = await surfaceBase();
  const access = await requirePermission("crm.calls");

  const page = Math.max(1, Number(firstParam(searchParams.page) ?? "1") || 1);
  const sizeParam = Number(firstParam(searchParams.size));
  const pageSize = PAGE_SIZES.includes(sizeParam) ? sizeParam : 25;
  const q = firstParam(searchParams.q) ?? "";
  const statusParam = firstParam(searchParams.status);
  const status = statusParam === "published" || statusParam === "draft" ? statusParam : undefined;
  const company = firstParam(searchParams.company) || undefined;

  // Drafts waiting to be published lead the page (RT.1), on the unfiltered
  // first page: until published, only the client's portal managers see them,
  // and the rest of the client's people see nothing.
  const showDrafts = page === 1 && !q && !status && !company;
  const [{ rows, total, error }, companies, companyOptions, drafts] = await Promise.all([
    listMeetings({ page, pageSize, search: q, status, company }),
    listClientCompanies(),
    listCompanyOptions(),
    showDrafts ? listMeetings({ page: 1, pageSize: 5, status: "draft" }) : null,
  ]);

  const columns: Column<AdminMeetingRow>[] = [
    {
      key: "meeting_date",
      header: "Date",
      cell: (m) => (m.meetingDate ? formatDate(m.meetingDate) : <span className="admin-cell-muted">—</span>),
    },
    {
      key: "title",
      header: "Meeting",
      cell: (m) => (
        <Link className="admin-cell-strong" href={`/admin/revenue/meetings/${m.id}`}>
          {m.title || "Untitled meeting"}
        </Link>
      ),
    },
    {
      key: "company",
      header: "Client",
      cell: (m) =>
        m.companyName ? (
          <Link href={`/admin/revenue/companies/${m.companyId}`}>{m.companyName}</Link>
        ) : (
          <span className="admin-cell-muted">—</span>
        ),
    },
    {
      key: "attendees",
      header: "Attendees",
      cell: (m) =>
        m.attendees.length > 0 ? (
          <span className="admin-cell-muted">{m.attendees.join(", ")}</span>
        ) : (
          <span className="admin-cell-muted">—</span>
        ),
    },
    { key: "status", header: "Status", cell: (m) => <MeetingStatusBadges meeting={m} /> },
  ];

  return (
    <>
      <PageHead
        eyebrow="Revenue"
        title="Client Meetings"
        sub={`${total.toLocaleString()} client meeting${total === 1 ? "" : "s"} on record`}
        action={
          <Link className="admin-btn admin-btn--primary" href="/admin/revenue/meetings/new">
            Add meeting
          </Link>
        }
      />
      {error && <div className="admin-alert admin-alert--err u-mb-4">{error}</div>}
      {drafts && !drafts.error && drafts.total > 0 && (
        <section className="admin-card admin-section-card u-mb-4" aria-labelledby="meetings-drafts-h">
          <div className="admin-card-head">
            <h2 className="admin-card-title" id="meetings-drafts-h">
              Notes to publish <span className="admin-home-note">{drafts.total} {drafts.total === 1 ? "draft" : "drafts"}, seen only by the client&rsquo;s portal managers until published</span>
            </h2>
            <Link href="/admin/revenue/meetings?status=draft" className="admin-auth-link">
              All drafts →
            </Link>
          </div>
          <div className="admin-list">
            {drafts.rows.map((m) => (
              <Link key={m.id} href={`/admin/revenue/meetings/${m.id}`} className="admin-list-row">
                <span className="admin-list-main">
                  <span className="admin-list-title">{m.title || "Untitled meeting"}</span>
                  <span className="admin-list-sub">{[m.companyName, m.meetingDate ? formatDate(m.meetingDate) : null].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="admin-list-aside">
                  <span className="admin-btn admin-btn--sm">Review and publish</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
      <LarkMeetingLinkForm companies={companyOptions} may={mayProp(access, ["crm.calls"])} />
      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        pageSizeOptions={PAGE_SIZES}
        basePath={`${surface}/revenue/meetings`}
        searchParams={searchParams}
        searchPlaceholder="Search by meeting title or client…"
        emptyText="No meetings match."
        filterBar={
          <FilterBar
            basePath={`${surface}/revenue/meetings`}
            searchParams={searchParams}
            filters={[
              {
                key: "company",
                label: "Client",
                options: companies.map((c) => ({ value: c.id, label: c.name })),
              },
              {
                key: "status",
                label: "Status",
                options: [
                  { value: "published", label: "Published" },
                  { value: "draft", label: "Draft" },
                ],
              },
            ]}
          />
        }
      />
    </>
  );
}
