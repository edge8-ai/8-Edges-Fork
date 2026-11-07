import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { DataTable, type Column } from "@/kernel/ui/DataTable";
import { Badge } from "@/kernel/ui/Badge";
import { formatCents, formatDate, humanize } from "@/kernel/ui/format";
import type { SearchParamsObj } from "@/kernel/ui/url";
import { listContractors } from "./data";
import type { ContractorRow } from "./contractor-shared";
import { ContractorsShelfProvider, ContractorShelfRow } from "./ContractorsShelf";

export const metadata = {
  title: "Contractors",
  description: "Contract team members and their pay rates.",
};

export default async function ContractorsPage(props: { searchParams: Promise<SearchParamsObj> }) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("company-os.operations");
  const searchParams = await props.searchParams;
  // Pay rates are people.pay (ADR 0014): anyone without it gets the roster
  // without the rate columns, and the rates are never fetched for them.
  const canSeePay = access.may("people.pay");
  const { rows, error } = await listContractors(canSeePay);

  const rateColumns: Column<ContractorRow>[] = [
    {
      key: "hourly",
      header: "Hourly",
      cell: (r) =>
        r.hourly_rate_cents !== null ? (
          <span className="admin-cell-mono">{formatCents(r.hourly_rate_cents, r.currency)}/h</span>
        ) : (
          <Badge tone="warn">No rate</Badge>
        ),
    },
    {
      key: "overtime",
      header: "Overtime",
      cell: (r) =>
        r.overtime_rate_cents !== null ? (
          <span className="admin-cell-mono">{formatCents(r.overtime_rate_cents, r.currency)}/h</span>
        ) : (
          <span className="admin-cell-muted">—</span>
        ),
    },
  ];

  const columns: Column<ContractorRow>[] = [
    {
      key: "name",
      header: "Contractor",
      cell: (r) => (
        <div>
          <span className="admin-cell-strong">{r.display_name}</span>
          <div className="admin-cell-muted u-sm">{r.email}</div>
        </div>
      ),
    },
    { key: "position", header: "Position", cell: (r) => r.position || <span className="admin-cell-muted">—</span> },
    { key: "department", header: "Department", cell: (r) => r.department || <span className="admin-cell-muted">—</span> },
    ...(canSeePay ? rateColumns : []),
    {
      key: "status",
      header: "Status",
      cell: (r) => <Badge tone={r.status === "active" ? "ok" : "neutral"}>{humanize(r.status)}</Badge>,
    },
    { key: "start_date", header: "Since", cell: (r) => formatDate(r.start_date) },
  ];

  return (
    <>
      <PageHead
        eyebrow="Operations"
        title="Contractors"
        sub={
          canSeePay
            ? `${rows.length} ${rows.length === 1 ? "contractor" : "contractors"} · rates power the monthly payment roll-up`
            : `${rows.length} ${rows.length === 1 ? "contractor" : "contractors"}`
        }
      />
      {error && <div className="admin-alert admin-alert--err u-mb-4">{error}</div>}
      <ContractorsShelfProvider canSeePay={canSeePay}>
        <DataTable
          columns={columns}
          rows={rows}
          total={rows.length}
          page={1}
          pageSize={Math.max(rows.length, 25)}
          basePath="/admin/operations/contractors"
          searchParams={searchParams}
          emptyText="No contract team members yet."
          renderRow={(row, cells) => <ContractorShelfRow row={row}>{cells}</ContractorShelfRow>}
        />
      </ContractorsShelfProvider>
    </>
  );
}
