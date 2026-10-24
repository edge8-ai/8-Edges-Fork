import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { listEntity } from "@/entities/company-os";
import { PageHead } from "@/kernel/ui/PageHead";
import { DataTable, type Column } from "@/kernel/ui/DataTable";
import { Badge } from "@/kernel/ui/Badge";
import { ArchivedToggle } from "@/kernel/ui/ArchivedToggle";
import { FilterBar } from "@/kernel/ui/FilterBar";
import { formatDate, humanize } from "@/kernel/ui/format";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { VENDOR_SELECT, VENDOR_TYPES, ratingTone, type VendorRow } from "@/entities/company-os/ui/vendors/vendor-shared";
import { VendorsShelfProvider, VendorShelfRow } from "@/entities/company-os/ui/vendors/VendorsShelf";
import { archiveVendor, restoreVendor, updateVendor } from "./actions";

export const metadata = {
  title: "Vendors",
  description: "Supplier directory — cars, tours, travel agencies, venues.",
};

const PAGE_SIZES = [25, 50, 100];
const SORTABLE = new Set(["name", "type", "rating", "created_at"]);

export default async function VendorsPage(props: { searchParams: Promise<SearchParamsObj> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("company-os.operations");
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

  const filters: Record<string, string> = {};
  if (typeParam && (VENDOR_TYPES as readonly string[]).includes(typeParam)) {
    filters.type = typeParam;
  }

  const { rows, total, pageSize, error } = await listEntity<VendorRow>("vendors", VENDOR_SELECT, {
    page,
    pageSize: pageSizeChoice,
    search: q,
    searchColumns: ["name", "notes", "primary_contact_name"],
    sort,
    dir,
    excludeArchived: !showArchived,
    filters,
  });

  const columns: Column<VendorRow>[] = [
    {
      key: "name",
      header: "Vendor",
      sortable: true,
      cell: (r) => <span className="admin-cell-strong">{r.name}</span>,
    },
    { key: "type", header: "Type", sortable: true, cell: (r) => <Badge>{humanize(r.type)}</Badge> },
    {
      key: "price_range",
      header: "Price range",
      cell: (r) => <span className="admin-cell-muted">{r.price_range || "—"}</span>,
    },
    {
      key: "contact",
      header: "Contact",
      cell: (r) => r.primary_contact_name || <span className="admin-cell-muted">—</span>,
    },
    {
      key: "phone",
      header: "Phone",
      cell: (r) =>
        r.phone || r.primary_contact_phone ? (
          <span className="admin-cell-mono">{r.phone || r.primary_contact_phone}</span>
        ) : (
          <span className="admin-cell-muted">—</span>
        ),
    },
    {
      key: "rating",
      header: "Rating",
      sortable: true,
      cell: (r) => (
        <span className="u-row">
          {r.archived_at && <Badge tone="neutral">Archived</Badge>}
          {r.rating ? <Badge tone={ratingTone(r.rating)}>{r.rating}</Badge> : !r.archived_at ? <span className="admin-cell-muted">—</span> : null}
        </span>
      ),
    },
    { key: "created_at", header: "Added", sortable: true, cell: (r) => formatDate(r.created_at) },
  ];

  return (
    <>
      <PageHead
        eyebrow="Operations"
        title="Vendors"
        sub={`${total.toLocaleString()} ${total === 1 ? "vendor" : "vendors"}${showArchived ? " · showing archived" : ""}`}
        action={
          <div className="u-row">
            <ArchivedToggle basePath="/admin/operations/vendors" searchParams={searchParams} showArchived={showArchived} />
            <Link href="/admin/operations/vendors/new" className="admin-btn admin-btn--primary">
              New vendor
            </Link>
          </div>
        }
      />
      {error && <div className="admin-alert admin-alert--err u-mb-4">{error}</div>}
      <VendorsShelfProvider actions={{ update: updateVendor, archive: archiveVendor, restore: restoreVendor }}>
        <DataTable
          columns={columns}
          rows={rows}
          total={total}
          page={page}
          pageSize={pageSize}
          pageSizeOptions={PAGE_SIZES}
          sort={sort}
          dir={dir}
          basePath="/admin/operations/vendors"
          searchParams={searchParams}
          searchPlaceholder="Search name, contact or notes…"
          emptyText="No vendors match."
          filterBar={
            <FilterBar
              basePath="/admin/operations/vendors"
              searchParams={searchParams}
              filters={[
                { key: "type", label: "Type", options: VENDOR_TYPES.map((t) => ({ value: t, label: humanize(t) })) },
              ]}
            />
          }
          renderRow={(row, cells) => <VendorShelfRow row={row}>{cells}</VendorShelfRow>}
        />
      </VendorsShelfProvider>
    </>
  );
}
