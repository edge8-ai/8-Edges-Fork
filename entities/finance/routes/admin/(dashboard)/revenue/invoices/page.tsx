import { requirePermission } from "@/kernel/identity/access-request";
import { mayProp } from "@/kernel/identity/may-prop";
import { surfaceBase } from "@/kernel/shell/surface";
import Link from "next/link";
import { companyOs } from "@/kernel/data/supabase";
import { INVOICE_OPEN, INVOICE_OVERDUE, INVOICE_STATUSES, INVOICE_VOIDED } from "@/entities/finance/lib/invoice-status";
import { selectInvoices } from "@/entities/finance/lib/reads";
import { invoiceBalanceUsd } from "@/entities/finance/lib/invoice-usd";
import { listEntity } from "@/entities/company-os";
import { PageHead } from "@/kernel/ui/PageHead";
import { DataTable, type Column } from "@/kernel/ui/DataTable";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { FilterBar } from "@/kernel/ui/FilterBar";
import { formatCents, formatDate, humanize } from "@/kernel/ui/format";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { INVOICE_SELECT, ENTITY_LABEL, type InvoiceListRow, type InvoiceEntity } from "./invoice-shared";
import { InvoicesShelfProvider, InvoiceShelfRow } from "./InvoicesShelf";
import { SyncButton } from "./SyncButton";

export const metadata = {
  title: "Invoices",
  description: "QuickBooks invoice ledger — read-only mirror, synced weekly.",
};

const PAGE_SIZES = [25, 50, 100];
const SORTABLE = new Set(["doc_number", "txn_date", "due_date", "amount_cents", "balance_cents"]);
const STATUSES = INVOICE_STATUSES;
const ENTITIES = ["edge8", "aio"] as const;

export default async function InvoicesPage(props: { searchParams: Promise<SearchParamsObj> }) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("finance.invoices");
  const may = mayProp(access, ["finance.invoices"]);
  const searchParams = await props.searchParams;
  const surface = await surfaceBase();
  const page = Math.max(1, Number(firstParam(searchParams.page) ?? "1") || 1);
  const sizeParam = Number(firstParam(searchParams.size));
  const pageSizeChoice = PAGE_SIZES.includes(sizeParam) ? sizeParam : 25;
  const q = firstParam(searchParams.q) ?? "";
  const sortParam = firstParam(searchParams.sort);
  const sort = sortParam && SORTABLE.has(sortParam) ? sortParam : "txn_date";
  const dir = firstParam(searchParams.dir) === "asc" ? "asc" : "desc";
  const statusParam = firstParam(searchParams.status);
  const entityParam = firstParam(searchParams.entity);

  // Voided invoices are hidden unless explicitly filtered to — they stay
  // reachable via the Voided option in the status filter.
  const filters: Record<string, string | string[] | null> = {};
  if (statusParam && (STATUSES as readonly string[]).includes(statusParam)) {
    filters.status = statusParam;
  } else {
    filters.status = STATUSES.filter((s) => s !== INVOICE_VOIDED);
  }
  if (entityParam && (ENTITIES as readonly string[]).includes(entityParam)) {
    filters.entity = entityParam;
  }
  // The Revenue hub's Data health links land here with the rows to fix:
  // invoices no deal claims, and invoices the sync could not classify.
  if (firstParam(searchParams.deal) === "none") filters.deal_id = null;
  if (firstParam(searchParams.kind) === "none") filters.kind = null;

  const [{ rows, total, pageSize, error }, outstandingRes] = await Promise.all([
    listEntity<InvoiceListRow>("invoices", INVOICE_SELECT, {
      page,
      pageSize: pageSizeChoice,
      search: q,
      searchColumns: ["doc_number", "customer_name"],
      sort,
      dir,
      filters,
    }),
    selectInvoices("balance_cents, balance_usd_cents, currency").in("status", [INVOICE_OPEN, INVOICE_OVERDUE]),
  ]);

  // In US dollars, through the one rule every revenue sum uses, so an AUD
  // balance is not added at par.
  type OutstandingRow = { balance_cents: number | null; balance_usd_cents: number | null; currency: string | null };
  const outstandingCents = ((outstandingRes.data as OutstandingRow[] | null) ?? []).reduce(
    (s, r) => s + invoiceBalanceUsd(r),
    0,
  );

  const columns: Column<InvoiceListRow>[] = [
    {
      key: "doc_number",
      header: "Invoice",
      sortable: true,
      cell: (r) => <span className="admin-cell-mono admin-cell-strong">{r.doc_number || "—"}</span>,
    },
    {
      key: "company",
      header: "Company",
      cell: (r) =>
        r.companies ? (
          <Link href={`${surface}/revenue/companies/${r.company_id}`}>{r.companies.name}</Link>
        ) : (
          <span className="admin-cell-muted">—</span>
        ),
    },
    {
      key: "customer_name",
      header: "Billed to",
      cell: (r) =>
        r.customer_name && r.customer_name !== r.companies?.name ? (
          <span className="admin-cell-muted">{r.customer_name}</span>
        ) : (
          <span className="admin-cell-muted">—</span>
        ),
    },
    { key: "txn_date", header: "Date", sortable: true, cell: (r) => formatDate(r.txn_date) },
    {
      key: "due_date",
      header: "Due",
      sortable: true,
      cell: (r) => (r.due_date ? formatDate(r.due_date) : <span className="admin-cell-muted">—</span>),
    },
    {
      key: "amount_cents",
      header: "Amount",
      sortable: true,
      cell: (r) => <span className="admin-cell-mono">{formatCents(r.amount_cents, r.currency)}</span>,
    },
    {
      key: "balance_cents",
      header: "Balance",
      sortable: true,
      cell: (r) =>
        r.balance_cents > 0 ? (
          <span className="admin-cell-mono">{formatCents(r.balance_cents, r.currency)}</span>
        ) : (
          <span className="admin-cell-muted">—</span>
        ),
    },
    {
      key: "entity",
      header: "Source",
      cell: (r) => <span className="admin-cell-muted">{ENTITY_LABEL[r.entity] ?? r.entity}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <Badge tone={statusTone(r.status)}>{humanize(r.status)}</Badge>,
    },
  ];

  return (
    <>
      <PageHead
        eyebrow="Revenue"
        title="Invoices"
        sub={`${total.toLocaleString()} ${total === 1 ? "invoice" : "invoices"} · ${formatCents(outstandingCents)} outstanding · synced from QuickBooks`}
        action={<SyncButton may={may} />}
      />
      {error && <div className="admin-alert admin-alert--err u-mb-4">{error}</div>}
      <InvoicesShelfProvider may={may}>
        <DataTable
          columns={columns}
          rows={rows}
          total={total}
          page={page}
          pageSize={pageSize}
          pageSizeOptions={PAGE_SIZES}
          sort={sort}
          dir={dir}
          basePath={`${surface}/revenue/invoices`}
          searchParams={searchParams}
          searchPlaceholder="Search invoice # or billed-to name…"
          emptyText="No invoices match."
          filterBar={
            <FilterBar
              basePath={`${surface}/revenue/invoices`}
              searchParams={searchParams}
              filters={[
                { key: "status", label: "Status", options: STATUSES.map((s) => ({ value: s, label: humanize(s) })) },
                { key: "entity", label: "Source", options: ENTITIES.map((e) => ({ value: e, label: ENTITY_LABEL[e as InvoiceEntity] })) },
                { key: "deal", label: "Deal link", options: [{ value: "none", label: "Not linked" }] },
                { key: "kind", label: "Kind", options: [{ value: "none", label: "Unclassified" }] },
              ]}
            />
          }
          renderRow={(row, cells) => <InvoiceShelfRow row={row}>{cells}</InvoiceShelfRow>}
        />
      </InvoicesShelfProvider>
    </>
  );
}
