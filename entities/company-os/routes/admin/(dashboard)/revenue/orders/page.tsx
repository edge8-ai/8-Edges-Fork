import { requirePermission } from "@/kernel/identity/access-request";
import { surfaceBase } from "@/kernel/shell/surface";
import Link from "next/link";
import { companyOs } from "@/kernel/data/supabase";
import { listEntity, countEntity } from "@/entities/company-os";
import { PageHead } from "@/kernel/ui/PageHead";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { DataTable, type Column } from "@/kernel/ui/DataTable";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { FilterBar } from "@/kernel/ui/FilterBar";
import { formatCents, formatDate, humanize } from "@/kernel/ui/format";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { one } from "@/kernel/config/embedded";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

export const metadata = {
  title: "Orders",
  description: "Customer orders and payments.",
};

// Revenue office: orders (financial records, read-mostly). Born from checkout.
type P = NamedPerson & { email: string };
type Pr = { title: string | null };
type Order = {
  id: string;
  amount_cents: number | null;
  amount_usd_cents: number | null;
  currency: string | null;
  status: string | null;
  payment_method: string | null;
  refunded_cents: number | null;
  stripe_session_id: string | null;
  created_at: string;
  person_id: string | null;
  people: P | P[] | null;
  products: Pr | Pr[] | null;
};

const PAGE_SIZE = 25;
const SORTABLE = new Set(["amount_usd_cents", "status", "payment_method", "created_at"]);

// Real distinct values in the table today (checked against the DB), not the full enum.
const STATUS_OPTIONS = [
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
  { value: "refunded", label: "Refunded" },
];
const METHOD_OPTIONS = [
  { value: "stripe", label: "Stripe" },
  { value: "offline_vn", label: "Offline (VN)" },
];

export default async function OrdersPage(props: { searchParams: Promise<SearchParamsObj> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("company-os.commerce");
  const searchParams = await props.searchParams;
  const surface = await surfaceBase();
  const page = Math.max(1, Number(firstParam(searchParams.page) ?? "1") || 1);
  const q = firstParam(searchParams.q) ?? "";
  const sortParam = firstParam(searchParams.sort);
  const sort = sortParam && SORTABLE.has(sortParam) ? sortParam : "created_at";
  const dir = firstParam(searchParams.dir) === "asc" ? "asc" : "desc";
  const statusParam = firstParam(searchParams.status);
  const methodParam = firstParam(searchParams.method);

  const filters: Record<string, string | number | boolean | null> = {};
  if (statusParam) filters.status = statusParam;
  if (methodParam) filters.payment_method = methodParam;

  // KPI strip: revenue sums amount_usd_cents (every currency normalized to USD by
  // company_os.set_amount_usd_cents); native currency + amount stay in the side car.
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const [{ rows, total, pageSize, error }, totalRes, revRes, paidCount, pendingCount] = await Promise.all([
    listEntity<Order>(
      "orders",
      `id, amount_cents, amount_usd_cents, currency, status, payment_method, refunded_cents, stripe_session_id, created_at, person_id, people(${NAME_COLUMNS}), products(title)`,
      { page, pageSize: PAGE_SIZE, search: q, searchColumns: ["stripe_session_id"], sort, dir, filters },
    ),
    companyOs.from("orders").select("amount_usd_cents").eq("status", "paid"),
    companyOs
      .from("orders")
      .select("amount_usd_cents")
      .eq("status", "paid")
      .gte("created_at", monthStart),
    countEntity("orders", { status: "paid" }),
    countEntity("orders", { status: "pending" }),
  ]);

  const sumCents = (res: { data: { amount_usd_cents: number | null }[] | null }) =>
    (res.data ?? []).reduce((s, r) => s + (r.amount_usd_cents ?? 0), 0);
  const totalCollected = sumCents(totalRes);
  const revenueThisMonth = sumCents(revRes);

  const columns: Column<Order>[] = [
    {
      key: "person",
      header: "Contact",
      cell: (r) => {
        const p = one(r.people);
        const label = personName(p, null);
        return <span className={label ? "admin-cell-strong" : "admin-cell-muted"}>{label || "—"}</span>;
      },
    },
    { key: "product", header: "Product", cell: (r) => one(r.products)?.title || <span className="admin-cell-muted">—</span> },
    { key: "amount_usd_cents", header: "Amount", sortable: true, align: "right", className: "admin-cell-mono", cell: (r) => formatCents(r.amount_usd_cents, "usd") },
    { key: "status", header: "Status", sortable: true, cell: (r) => (r.status ? <Badge tone={statusTone(r.status)}>{humanize(r.status)}</Badge> : <span className="admin-cell-muted">—</span>) },
    { key: "payment_method", header: "Method", sortable: true, cell: (r) => (r.payment_method ? humanize(r.payment_method) : <span className="admin-cell-muted">—</span>) },
    { key: "created_at", header: "Added", sortable: true, cell: (r) => formatDate(r.created_at) },
  ];

  return (
    <>
      <PageHead eyebrow="Revenue" title="Orders" sub={`${total.toLocaleString()} ${total === 1 ? "order" : "orders"}`} />
      {error && <div className="admin-alert admin-alert--err u-mb-4">{error}</div>}

      <div className="admin-kpi-grid u-mb-5">
        <MetricCard label="Total Collected" value={formatCents(totalCollected)} sub="USD · paid orders" />
        <MetricCard label="Revenue this Month" value={formatCents(revenueThisMonth)} sub="USD · paid orders" />
        <MetricCard label="Paid" value={paidCount} sub={`of ${total.toLocaleString()} orders`} />
        <MetricCard label="Pending" value={pendingCount} sub="awaiting payment" />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        sort={sort}
        dir={dir}
        basePath={`${surface}/revenue/orders`}
        searchParams={searchParams}
        searchPlaceholder="Search Stripe session…"
        emptyText="No orders match."
        filterBar={
          <FilterBar
            basePath={`${surface}/revenue/orders`}
            searchParams={searchParams}
            filters={[
              { key: "status", label: "Status", options: STATUS_OPTIONS },
              { key: "method", label: "Method", options: METHOD_OPTIONS },
            ]}
          />
        }
        getRowPreview={(r) => {
          const p = one(r.people);
          return {
            eyebrow: "Order",
            title: personName(p, "Order"),
            body: (
              <>
                <dl className="admin-kv">
                  <dt>Contact</dt>
                  <dd>{personName(p, "—")}</dd>
                  <dt>Product</dt>
                  <dd>{one(r.products)?.title || "—"}</dd>
                  <dt>Amount</dt>
                  <dd className="admin-cell-mono">{formatCents(r.amount_usd_cents, "usd")}</dd>
                  {(r.currency ?? "usd").toLowerCase() !== "usd" && (
                    <>
                      <dt>Native</dt>
                      <dd className="admin-cell-mono">{formatCents(r.amount_cents, r.currency ?? undefined)}</dd>
                    </>
                  )}
                  <dt>Status</dt>
                  <dd>{r.status ? <Badge tone={statusTone(r.status)}>{humanize(r.status)}</Badge> : "—"}</dd>
                  <dt>Method</dt>
                  <dd>{r.payment_method ? humanize(r.payment_method) : "—"}</dd>
                  {r.refunded_cents ? (
                    <>
                      <dt>Refunded</dt>
                      <dd className="admin-cell-mono">{formatCents(r.refunded_cents, r.currency ?? undefined)}</dd>
                    </>
                  ) : null}
                  <dt>Stripe</dt>
                  <dd className="admin-cell-mono u-sm u-break-all">{r.stripe_session_id || "—"}</dd>
                  <dt>Created</dt>
                  <dd>{formatDate(r.created_at)}</dd>
                </dl>
                {r.person_id && (
                  <div className="u-mt-4">
                    <Link href={`/admin/contacts/${r.person_id}`} className="admin-btn admin-btn--primary">
                      Open contact
                    </Link>
                  </div>
                )}
              </>
            ),
          };
        }}
      />
    </>
  );
}
