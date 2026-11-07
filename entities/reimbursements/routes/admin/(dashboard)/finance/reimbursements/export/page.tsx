import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { saigonToday } from "@/kernel/config/dates";
import { isExportMonth } from "@/entities/reimbursements/lib/export";

export const metadata = {
  title: "Reimbursements Export",
  description: "The month-end export: a spreadsheet of every paid receipt and a zip of every document behind it.",
};

// /admin/finance/reimbursements/export — the month-end export (plan section 11,
// RB.12), behind reimbursements.pay: the bookkeeper reconciles the month's paid
// claims against the books from a spreadsheet, one row per receipt, and a zip
// of every receipt, red invoice and bank receipt behind it. Both are built when
// asked for, behind sign-in, and never stored or emailed; the zip streams from
// storage as it is downloaded.
export default async function ReimbursementsExportPage(props: { searchParams: Promise<{ month?: string }> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("reimbursements.pay");
  const asked = (await props.searchParams).month ?? "";
  const month = isExportMonth(asked) ? asked : saigonToday().slice(0, 7);
  const base = "/admin/finance/reimbursements/export";
  return (
    <>
      <PageHead eyebrow="Reimbursements" title="Month-end export" sub="Every claim paid in a month: one spreadsheet row per receipt, and every document behind them." />
      <section className="admin-card admin-section-card">
        <form method="get" action={base} className="admin-field">
          <label className="admin-label" htmlFor="export-month">
            Month (claims paid in it, Vietnam time)
          </label>
          <input id="export-month" name="month" type="month" className="admin-input" defaultValue={month} />
          <button type="submit" className="admin-btn">
            Show this month
          </button>
        </form>
      </section>
      <section className="admin-card admin-section-card">
        <h2 className="admin-card-title">{month}</h2>
        <p className="admin-hint">
          The spreadsheet has one row per receipt: claimant, claim, trip, category, seller, date, the amount and currency as paid, the rate and its source, the VND,
          whether it was declined, whether its claimant removed it, the client to rebill, the day it was paid and the run. A declined or removed receipt is listed
          at 0 VND. The documents come as one zip, a folder per claim, with the bank receipts in their own folder; a replaced document and the documents of a
          removed receipt are kept and named as such.
        </p>
        <div className="admin-form-actions">
          <a className="admin-btn admin-btn--primary" href={`${base}/spreadsheet?month=${month}`}>
            Download the spreadsheet
          </a>
          <a className="admin-btn" href={`${base}/documents?month=${month}`}>
            Download every document (zip)
          </a>
        </div>
      </section>
    </>
  );
}
