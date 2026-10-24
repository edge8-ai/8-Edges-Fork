import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { DataTable, type Column } from "@/kernel/ui/DataTable";
import { Badge } from "@/kernel/ui/Badge";
import { getContactsSummary } from "@/entities/crm/lib/contacts-summary";
import { formatDate, formatCents, humanize } from "@/kernel/ui/format";
import { legalName } from "@/kernel/config/people-name";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { listEntity } from "@/entities/company-os";
import { ArchivedToggle } from "@/kernel/ui/ArchivedToggle";
import { FilterBar } from "@/kernel/ui/FilterBar";
import { DonutChart } from "@/kernel/ui/charts/DonutChart";
import { ContactsShelfProvider, ContactShelfRow, type ContactRow } from "./ContactsShelf";

export const metadata = {
  title: "Contacts",
  description: "Every person in the Company Database, one searchable contact spine.",
};

type Person = ContactRow;

const PAGE_SIZE = 25;
const SORTABLE = new Set(["full_name", "email", "phone", "persona", "country", "deal_value_usd_cents", "created_at"]);

// Sentinel for "persona is null" — distinct from "" (no filter applied).
const UNSET = "__unset__";

const PERSONA_OPTIONS = [
  { value: "job_seeker", label: "Job seeker" },
  { value: "prospect", label: "Prospect" },
  { value: "client", label: "Client" },
  { value: "employee", label: "Employee" },
  { value: UNSET, label: "Unset" },
];
const STAGE_OPTIONS = [
  { value: "lead", label: "Lead" },
  { value: "customer", label: "Customer" },
  { value: "none", label: "None" },
];
const TEAM_OPTIONS = [
  { value: "true", label: "Team only" },
  { value: "false", label: "Non-team" },
];

export default async function ContactsPage(props: { searchParams: Promise<SearchParamsObj> }) {
  await requirePermission("crm.contacts");
  const searchParams = await props.searchParams;
  const page = Math.max(1, Number(firstParam(searchParams.page) ?? "1") || 1);
  const q = firstParam(searchParams.q) ?? "";
  const sortParam = firstParam(searchParams.sort);
  const sort = sortParam && SORTABLE.has(sortParam) ? sortParam : "created_at";
  const dir = firstParam(searchParams.dir) === "asc" ? "asc" : "desc";
  const showArchived = firstParam(searchParams.archived) === "1";

  const personaParam = firstParam(searchParams.persona);
  const stageParam = firstParam(searchParams.stage);
  const teamParam = firstParam(searchParams.team);

  const filters: Record<string, string | number | boolean | null> = {};
  if (personaParam) filters.persona = personaParam === UNSET ? null : personaParam;
  if (stageParam) filters.lifecycle_stage = stageParam;
  if (teamParam === "true" || teamParam === "false") filters.is_team_member = teamParam === "true";

  const [{ rows, total, pageSize, error }, summary] = await Promise.all([
    listEntity<Person>(
      "people_with_deals",
      "id, full_name, email, phone, persona, country, source, do_not_contact, is_team_member, archived_at, created_at, deal_value_usd_cents, deal_count",
      {
        page,
        pageSize: PAGE_SIZE,
        search: q,
        searchColumns: ["full_name", "email", "phone"],
        sort,
        dir,
        excludeArchived: !showArchived,
        filters,
      },
    ),
    getContactsSummary(),
  ]);

  const columns: Column<Person>[] = [
    {
      key: "full_name",
      header: "Name",
      sortable: true,
      // The name on record, because the column sorts and searches by full_name
      // (S.16): the display name would file "Hiếu Nguyễn" under N.
      cell: (r) => <span className="admin-cell-strong">{legalName(r, "(no name)")}</span>,
    },
    { key: "email", header: "Email", sortable: true, cell: (r) => <span className="admin-cell-muted">{r.email}</span> },
    { key: "phone", header: "Phone", sortable: true, cell: (r) => r.phone || <span className="admin-cell-muted">—</span> },
    {
      key: "persona",
      header: "Persona",
      sortable: true,
      cell: (r) => (r.persona ? <Badge>{humanize(r.persona)}</Badge> : <span className="admin-cell-muted">—</span>),
    },
    { key: "country", header: "Country", sortable: true, cell: (r) => r.country || <span className="admin-cell-muted">—</span> },
    {
      key: "deal_value_usd_cents",
      header: "Deal value",
      sortable: true,
      align: "right",
      cell: (r) => (r.deal_count ? formatCents(r.deal_value_usd_cents) : <span className="admin-cell-muted">—</span>),
    },
    { key: "created_at", header: "Added", sortable: true, cell: (r) => formatDate(r.created_at) },
  ];

  return (
    <>
      <PageHead
        eyebrow="Spine"
        title="Contacts"
        sub={`${total.toLocaleString()} ${total === 1 ? "person" : "people"}${showArchived ? " · showing archived" : ""} in the Company Database`}
        action={
          <ArchivedToggle basePath="/admin/contacts" searchParams={searchParams} showArchived={showArchived} />
        }
      />
      {summary && (
        <div className="admin-summary">
          <div className="admin-summary-pills">
            <div className="admin-pill">
              <span className="admin-pill-label">Contacts</span>
              <span className="admin-pill-val">{summary.total.toLocaleString()}</span>
            </div>
            <div className="admin-pill">
              <span className="admin-pill-label">Prospects</span>
              <span className="admin-pill-val">{summary.prospects.toLocaleString()}</span>
            </div>
            <div className="admin-pill">
              <span className="admin-pill-label">Clients</span>
              <span className="admin-pill-val">{summary.clients.toLocaleString()}</span>
            </div>
          </div>
          <div className="admin-summary-grid">
            <div className="admin-card admin-chart-card">
              <div className="admin-kpi-label">By persona</div>
              <DonutChart
                data={summary.personas}
                centerLabel="contacts"
                ariaLabel="Contacts by persona"
                neutralLabel="Unset"
                emptyText="No contacts yet."
              />
            </div>
            <div className="admin-card admin-chart-card">
              <div className="admin-kpi-label">By source</div>
              <DonutChart
                data={summary.sources}
                centerLabel="contacts"
                ariaLabel="Contacts by source channel"
                emptyText="No source data yet."
              />
            </div>
            <div className="admin-card admin-chart-card">
              <div className="admin-kpi-label">By country</div>
              <DonutChart
                data={summary.countries}
                centerLabel="contacts"
                ariaLabel="Contacts by country"
                neutralLabel="Unknown"
                emptyText="Country data pending enrichment."
              />
            </div>
          </div>
        </div>
      )}
      {error && (
        <div className="admin-alert admin-alert--err u-mb-4">
          {error}
        </div>
      )}
      <ContactsShelfProvider>
        <DataTable
          columns={columns}
          rows={rows}
          total={total}
          page={page}
          pageSize={pageSize}
          sort={sort}
          dir={dir}
          basePath="/admin/contacts"
          searchParams={searchParams}
          searchPlaceholder="Search name, email, or phone…"
          emptyText="No contacts match."
          filterBar={
            <FilterBar
              basePath="/admin/contacts"
              searchParams={searchParams}
              filters={[
                { key: "persona", label: "Persona", options: PERSONA_OPTIONS },
                { key: "stage", label: "Stage", options: STAGE_OPTIONS },
                { key: "team", label: "Team", options: TEAM_OPTIONS },
              ]}
            />
          }
          renderRow={(row, cells) => <ContactShelfRow row={row}>{cells}</ContactShelfRow>}
        />
      </ContactsShelfProvider>
    </>
  );
}
