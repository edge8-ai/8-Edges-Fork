import { requirePermission } from "@/kernel/identity/access-request";
import { listAssignablePeople } from "@/entities/crm";
import Link from "next/link";
import { listEntity } from "@/entities/company-os";
import { byFirstName, personName } from "@/kernel/config/people-name";
import { PageHead } from "@/kernel/ui/PageHead";
import { DataTable, type Column } from "@/kernel/ui/DataTable";
import { Badge } from "@/kernel/ui/Badge";
import { ArchivedToggle } from "@/kernel/ui/ArchivedToggle";
import { FilterBar } from "@/kernel/ui/FilterBar";
import { formatDate, humanize } from "@/kernel/ui/format";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import {
  equipmentSummary,
  listPendingRequests,
  listVendorOptions,
} from "@/entities/org/lib/equipment";
import {
  EQUIPMENT_SELECT,
  EQUIPMENT_STATUSES,
  EQUIPMENT_TYPES,
  specSummary,
  statusLabel,
  statusTone,
  type EquipmentRow,
} from "@/entities/org/lib/equipment-shared";
import { EquipmentShelfProvider, EquipmentShelfRow } from "./EquipmentShelf";
import { RequestsPanel } from "./RequestsPanel";

export const metadata = {
  title: "Equipment",
  description: "Company equipment register: what we own, who has it, and what it cost.",
};

const PAGE_SIZES = [25, 50, 100];
const SORTABLE = new Set(["asset_tag", "name", "type", "status", "purchase_date", "cost_vnd", "holder"]);

// "Assigned to" is a joined column, so it sorts through PostgREST's embedded
// ordering on the aliased embed rather than a column on equipment itself. The
// UI keeps the plain key ("holder") for the header state; only the query is
// remapped. Verified against the REST endpoint, not assumed, with full_name;
// S.16 moved it to display_name, a column of the same embed, so the list sorts
// by the name it shows (personName) — not yet re-verified against the endpoint.
// Most people have no display_name (37 of 62 on 2026-09-23), and personName
// shows them by full_name, so those sort after the named ones, by full_name
// (S.16.16).
const SORT_COLUMN: Record<string, string> = { holder: "holder(display_name)" };
const SORT_THEN: Record<string, string[]> = { holder: ["holder(full_name)"] };

export default async function EquipmentPage(props: { searchParams: Promise<SearchParamsObj> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("org.operations");
  const searchParams = await props.searchParams;
  const page = Math.max(1, Number(firstParam(searchParams.page) ?? "1") || 1);
  const sizeParam = Number(firstParam(searchParams.size));
  const pageSizeChoice = PAGE_SIZES.includes(sizeParam) ? sizeParam : 25;
  const q = firstParam(searchParams.q) ?? "";
  const sortParam = firstParam(searchParams.sort);
  const sort = sortParam && SORTABLE.has(sortParam) ? sortParam : "name";
  const dir = firstParam(searchParams.dir) === "desc" ? "desc" : "asc";
  const showArchived = firstParam(searchParams.archived) === "1";
  const typeParam = firstParam(searchParams.type);
  const statusParam = firstParam(searchParams.status);

  const filters: Record<string, string> = {};
  if (typeParam && (EQUIPMENT_TYPES as readonly string[]).includes(typeParam)) filters.type = typeParam;
  if (statusParam && (EQUIPMENT_STATUSES as readonly string[]).includes(statusParam)) {
    filters.status = statusParam;
  }

  const [{ rows, total, pageSize, error }, summary, people, vendors, requests] = await Promise.all([
    listEntity<EquipmentRow>("equipment", EQUIPMENT_SELECT, {
      page,
      pageSize: pageSizeChoice,
      search: q,
      searchColumns: ["name", "asset_tag", "brand", "model", "serial_number", "notes"],
      sort: SORT_COLUMN[sort] ?? sort,
      dir,
      nullsLast: sort in SORT_THEN,
      thenBy: SORT_THEN[sort],
      excludeArchived: !showArchived,
      filters,
    }),
    equipmentSummary(),
    listAssignablePeople(),
    listVendorOptions(),
    listPendingRequests(),
  ]);

  // Leavers can still hold equipment, and they aren't in the assignable list.
  // Merge any current holder on this page in so the shelf can name them.
  const holders = new Map(people.map((p) => [p.id, p]));
  for (const r of rows) {
    const holderName = personName(r.holder, null);
    if (r.holder?.id && holderName && !holders.has(r.holder.id)) {
      holders.set(r.holder.id, { id: r.holder.id, name: holderName });
    }
  }
  const peopleOptions = [...holders.values()].sort((a, b) => byFirstName(a.name, b.name));

  const columns: Column<EquipmentRow>[] = [
    {
      key: "name",
      header: "Item",
      sortable: true,
      cell: (r) => (
        <div>
          <span className="admin-cell-strong">{r.name}</span>
          {specSummary(r) && <div className="admin-cell-muted">{specSummary(r)}</div>}
        </div>
      ),
    },
    { key: "asset_tag", header: "Tag", sortable: true, cell: (r) => <span className="admin-cell-mono">{r.asset_tag}</span> },
    { key: "type", header: "Type", sortable: true, cell: (r) => <Badge>{humanize(r.type)}</Badge> },
    {
      key: "holder",
      header: "Assigned to",
      sortable: true,
      cell: (r) => personName(r.holder, null) ?? <span className="admin-cell-muted">Unassigned</span>,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      cell: (r) => (
        <span className="u-row">
          {r.archived_at && <Badge tone="neutral">Archived</Badge>}
          <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>
        </span>
      ),
    },
    {
      key: "purchase_date",
      header: "Purchased",
      sortable: true,
      cell: (r) => (r.purchase_date ? formatDate(r.purchase_date) : <span className="admin-cell-muted">—</span>),
    },
    {
      key: "cost_vnd",
      header: "Cost",
      sortable: true,
      cell: (r) =>
        r.cost_vnd !== null && r.cost_vnd !== undefined ? (
          <span className="admin-cell-mono">{Number(r.cost_vnd).toLocaleString("en-US")}</span>
        ) : (
          <span className="admin-cell-muted">—</span>
        ),
    },
  ];

  const sub =
    `${total.toLocaleString()} ${total === 1 ? "item" : "items"}` +
    ` · ${summary.inUse} in use · ${summary.inStock} in stock` +
    ` · ${summary.valueVnd.toLocaleString("en-US")} VND on the register` +
    (showArchived ? " · showing archived" : "");

  return (
    <>
      <PageHead
        eyebrow="Operations"
        title="Equipment"
        sub={sub}
        action={
          <div className="u-row">
            <ArchivedToggle basePath="/admin/operations/equipment" searchParams={searchParams} showArchived={showArchived} />
            <Link href="/admin/operations/equipment/fitness" className="admin-btn">
              Fitness
            </Link>
            <Link href="/admin/operations/equipment/new" className="admin-btn admin-btn--primary">
              New equipment
            </Link>
          </div>
        }
      />
      {error && <div className="admin-alert admin-alert--err u-mb-4">{error}</div>}
      <RequestsPanel requests={requests} />
      <EquipmentShelfProvider people={peopleOptions} vendors={vendors}>
        <DataTable
          columns={columns}
          rows={rows}
          total={total}
          page={page}
          pageSize={pageSize}
          pageSizeOptions={PAGE_SIZES}
          sort={sort}
          dir={dir}
          basePath="/admin/operations/equipment"
          searchParams={searchParams}
          searchPlaceholder="Search name, tag, serial or notes…"
          emptyText="No equipment matches."
          filterBar={
            <FilterBar
              basePath="/admin/operations/equipment"
              searchParams={searchParams}
              filters={[
                { key: "type", label: "Type", options: EQUIPMENT_TYPES.map((t) => ({ value: t, label: humanize(t) })) },
                {
                  key: "status",
                  label: "Status",
                  options: EQUIPMENT_STATUSES.map((s) => ({ value: s, label: statusLabel(s) })),
                },
              ]}
            />
          }
          renderRow={(row, cells) => <EquipmentShelfRow row={row}>{cells}</EquipmentShelfRow>}
        />
      </EquipmentShelfProvider>
    </>
  );
}
