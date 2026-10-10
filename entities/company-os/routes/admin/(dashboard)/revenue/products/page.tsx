import { requirePermission } from "@/kernel/identity/access-request";
import { surfaceBase } from "@/kernel/shell/surface";
import { listEntity, countEntity } from "@/entities/company-os";
import { companyOs } from "@/kernel/data/supabase";
import { selectProducts } from "@/entities/finance";
import { PageHead } from "@/kernel/ui/PageHead";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { DataTable, type Column } from "@/kernel/ui/DataTable";
import { Badge } from "@/kernel/ui/Badge";
import { FilterBar } from "@/kernel/ui/FilterBar";
import { formatCents, formatDate, humanize } from "@/kernel/ui/format";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";

export const metadata = {
  title: "Products",
  description: "Sellable products and services.",
};

// Revenue office: the sellable catalog (events, sprints, memberships).
type Product = {
  id: string;
  title: string | null;
  type: string | null;
  tier: string | null;
  location: string | null;
  date_start: string | null;
  amount_cents: number | null;
  amount_usd_cents: number | null;
  currency: string | null;
  active: boolean | null;
  created_at: string;
};

const PAGE_SIZE = 25;
const SORTABLE = new Set(["title", "type", "tier", "location", "date_start", "amount_usd_cents", "active", "created_at"]);

// Real distinct values in the table today (checked against the DB). Tier is omitted
// deliberately: its values are dirty (mixed naming schemes), so it makes a poor filter.
const TYPE_OPTIONS = [
  { value: "event", label: "Event" },
  { value: "private_sprint", label: "Private sprint" },
  { value: "service", label: "Service" },
  { value: "membership", label: "Membership" },
];

export default async function ProductsPage(props: { searchParams: Promise<SearchParamsObj> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("company-os.commerce");
  const searchParams = await props.searchParams;
  const surface = await surfaceBase();
  const page = Math.max(1, Number(firstParam(searchParams.page) ?? "1") || 1);
  const q = firstParam(searchParams.q) ?? "";
  const sortParam = firstParam(searchParams.sort);
  const sort = sortParam && SORTABLE.has(sortParam) ? sortParam : "created_at";
  const dir = firstParam(searchParams.dir) === "asc" ? "asc" : "desc";
  const typeParam = firstParam(searchParams.type);

  const filters: Record<string, string | number | boolean | null> = {};
  if (typeParam) filters.type = typeParam;

  const nowIso = new Date().toISOString();

  const [{ rows, total, pageSize, error }, activeCount, upcomingRes] = await Promise.all([
    listEntity<Product>(
      "products",
      "id, title, type, tier, location, date_start, amount_cents, amount_usd_cents, currency, active, created_at",
      { page, pageSize: PAGE_SIZE, search: q, searchColumns: ["title"], sort, dir, filters },
    ),
    countEntity("products", { active: true }),
    selectProducts("*", { count: "exact", head: true })
      .eq("active", true)
      .gte("date_start", nowIso),
  ]);

  const upcomingCount = upcomingRes.count ?? 0;

  const columns: Column<Product>[] = [
    { key: "title", header: "Title", sortable: true, cell: (r) => <span className="admin-cell-strong">{r.title || "(untitled)"}</span> },
    { key: "type", header: "Type", sortable: true, cell: (r) => (r.type ? <Badge>{humanize(r.type)}</Badge> : <span className="admin-cell-muted">—</span>) },
    { key: "tier", header: "Tier", sortable: true, cell: (r) => r.tier || <span className="admin-cell-muted">—</span> },
    { key: "location", header: "Location", sortable: true, cell: (r) => r.location || <span className="admin-cell-muted">—</span> },
    { key: "date_start", header: "Starts", sortable: true, cell: (r) => (r.date_start ? formatDate(r.date_start) : <span className="admin-cell-muted">—</span>) },
    { key: "amount_usd_cents", header: "Price", sortable: true, align: "right", className: "admin-cell-mono", cell: (r) => formatCents(r.amount_usd_cents, "usd") },
    { key: "active", header: "Active", sortable: true, cell: (r) => (r.active ? <Badge tone="ok">Active</Badge> : <Badge tone="neutral">Inactive</Badge>) },
    { key: "created_at", header: "Added", sortable: true, cell: (r) => formatDate(r.created_at) },
  ];

  return (
    <>
      <PageHead eyebrow="Revenue" title="Products" sub={`${total.toLocaleString()} ${total === 1 ? "product" : "products"}`} />
      {error && <div className="admin-alert admin-alert--err u-mb-4">{error}</div>}

      <div className="admin-kpi-grid u-mb-5">
        <MetricCard label="Active products" value={activeCount} sub={`of ${total.toLocaleString()} in catalog`} />
        <MetricCard label="Upcoming" value={upcomingCount} sub="active, future start date" />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        sort={sort}
        dir={dir}
        basePath={`${surface}/revenue/products`}
        searchParams={searchParams}
        searchPlaceholder="Search title…"
        emptyText="No products match."
        filterBar={
          <FilterBar
            basePath={`${surface}/revenue/products`}
            searchParams={searchParams}
            filters={[{ key: "type", label: "Type", options: TYPE_OPTIONS }]}
          />
        }
        getRowPreview={(r) => ({
          eyebrow: "Product",
          title: r.title || "(untitled)",
          body: (
            <dl className="admin-kv">
              <dt>Type</dt>
              <dd>{r.type ? <Badge>{humanize(r.type)}</Badge> : "—"}</dd>
              <dt>Tier</dt>
              <dd>{r.tier || "—"}</dd>
              <dt>Location</dt>
              <dd>{r.location || "—"}</dd>
              <dt>Starts</dt>
              <dd>{r.date_start ? formatDate(r.date_start) : "—"}</dd>
              <dt>Price</dt>
              <dd className="admin-cell-mono">{formatCents(r.amount_usd_cents, "usd")}</dd>
              {(r.currency ?? "usd").toLowerCase() !== "usd" && (
                <>
                  <dt>Native</dt>
                  <dd className="admin-cell-mono">{formatCents(r.amount_cents, r.currency ?? undefined)}</dd>
                </>
              )}
              <dt>Active</dt>
              <dd>{r.active ? <Badge tone="ok">Active</Badge> : <Badge tone="neutral">Inactive</Badge>}</dd>
              <dt>Created</dt>
              <dd>{formatDate(r.created_at)}</dd>
            </dl>
          ),
        })}
      />
    </>
  );
}
