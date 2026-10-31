import Link from "next/link";
import { requirePermission } from "@/kernel/identity/access-request";
import { Badge } from "@/kernel/ui/Badge";
import { PageHead } from "@/kernel/ui/PageHead";
import { formatDate, formatVndWhole, formatMonth } from "@/kernel/ui/format";
import { listPayrollRuns } from "@/entities/finance/lib/payroll/store";
import { previewPayroll, savePayroll } from "./actions";
import { PayrollUpload } from "./PayrollUpload";

export const metadata = {
  title: "Payroll",
  description: "Every payroll month from the accountant's workbooks, and the upload for a new one.",
};

// /team/finance/payroll: every payroll month and the upload for a new one
// (docs/plans/2026-10-10-contractor-portal.md, PR 3). Payroll is pay, so the
// page is the accountant's and Super Admin's (finance.payroll).
export default async function PayrollPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("finance.payroll");
  const runs = await listPayrollRuns();

  return (
    <>
      <PageHead title="Payroll" sub="One row per month, from the accountant's workbook. Upload a month to add it, or to replace it." />

      <section className="admin-card admin-section-card">
        <h2 className="admin-card-title u-mb-3">Upload a month</h2>
        <PayrollUpload previewPayroll={previewPayroll} savePayroll={savePayroll} />
      </section>

      <section className="admin-card admin-section-card">
        <h2 className="admin-card-title u-mb-3">Months</h2>
        {runs.length === 0 ? (
          <div className="admin-empty">No payroll months yet. Upload the first workbook above.</div>
        ) : (
          <div className="admin-list">
            {runs.map((r) => (
              <div key={r.id} className="admin-list-row">
                <div className="admin-list-main">
                  <div className="admin-list-title">
                    <Link href={`/team/finance/payroll/${r.id}`}>{formatMonth(r.period)}</Link>
                  </div>
                  <div className="admin-list-sub">
                    {r.lines} {r.lines === 1 ? "person" : "people"} · from {r.sourceFile ?? "a workbook"} · saved {formatDate(r.importedAt)}
                  </div>
                </div>
                <div className="admin-list-aside">
                  <span className="u-strong">{formatVndWhole(r.paidVnd || r.netVnd)}</span>
                  {r.isEstimate && <Badge tone="warn">Estimate</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
