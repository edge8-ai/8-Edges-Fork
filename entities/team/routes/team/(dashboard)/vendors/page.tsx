import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { listEntity } from "@/entities/company-os";
import {
  TEAM_VENDOR_SELECT,
  VENDOR_TYPES,
  ratingTone,
  VendorsShelfProvider,
  VendorShelfRow,
  type TeamVendorRow,
} from "@/entities/company-os/client";
import { PageHead } from "@/kernel/ui/PageHead";
import { DataTable, type Column } from "@/kernel/ui/DataTable";
import { Badge } from "@/kernel/ui/Badge";
import { FilterBar } from "@/kernel/ui/FilterBar";
import { formatDate, humanize } from "@/kernel/ui/format";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";

export const metadata = {
  title: "Vendors",
  description: "Supplier directory: cars, tours, travel agencies, venues.",
};

const BASE = "/team/vendors";
const PAGE_SIZES = [25, 50, 100];
const SORTABLE = new Set(["name", "type", "rating", "created_at"]);

// /team/vendors: the supplier directory for every team member. It reads the
// team select, which leaves out tax IDs and bank details, shows active vendors
// only, and hands the shelf no actions, so the drawer is read-only. Adding a
// vendor goes through ./actions.ts; editing and archiving stay on the admin page.
export default async function TeamVendorsPage(props: { searchParams: Promise<SearchParamsObj> }) {
  // The page's declared permission (entities/team/permissions.ts, ADR 0013).
  await requirePermission("team.vendors");
  const searchParams = await props.searchParams;
  await requireTeamMember();

  const page = Math.max(1, Number(firstParam(searchParams.page) ?? "1") || 1);
  const sizeParam = Number(firstParam(searchParams.size));
  const pageSizeChoice = PAGE_SIZES.includes(sizeParam) ? sizeParam : 25;
  const q = firstParam(searchParams.q) ?? "";
  const sortParam = firstParam(searchParams.sort);
  const sort = sortParam && SORTABLE.has(sortParam) ? sortParam : "name";
  const dir = firstParam(searchParams.dir) === "desc" ? "desc" : "asc";
  const typeParam = firstParam(searchParams.type);

  const filters: Record<string, string> = {};
  if (typeParam && (VENDOR_TYPES as readonly string[]).includes(typeParam)) {
    filters.type = typeParam;
  }

  const { rows, total, pageSize, error } = await listEntity<TeamVendorRow>("vendors", TEAM_VENDOR_SELECT, {
    page,
    pageSize: pageSizeChoice,
    search: q,
    searchColumns: ["name", "notes", "primary_contact_name"],
    sort,
    dir,
    excludeArchived: true,
    filters,
  });

  const columns: Column<TeamVendorRow>[] = [
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
      cell: (r) =>
        r.rating ? <Badge tone={ratingTone(r.rating)}>{r.rating}</Badge> : <span className="admin-cell-muted">—</span>,
    },
    { key: "created_at", header: "Added", sortable: true, cell: (r) => formatDate(r.created_at) },
  ];

  return (
    <>
      <PageHead
        eyebrow="Company"
        title="Vendors"
        sub={`${total.toLocaleString()} ${total === 1 ? "vendor" : "vendors"}`}
        action={
          <Link href={`${BASE}/new`} className="admin-btn admin-btn--primary">
            New vendor
          </Link>
        }
      />
      {error && <div className="admin-alert admin-alert--err u-mb-4">{error}</div>}
      <VendorsShelfProvider>
        <DataTable
          columns={columns}
          rows={rows}
          total={total}
          page={page}
          pageSize={pageSize}
          pageSizeOptions={PAGE_SIZES}
          sort={sort}
          dir={dir}
          basePath={BASE}
          searchParams={searchParams}
          searchPlaceholder="Search name, contact or notes…"
          emptyText="No vendors match."
          filterBar={
            <FilterBar
              basePath={BASE}
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
