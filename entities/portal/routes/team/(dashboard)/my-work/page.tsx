import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { Badge } from "@/kernel/ui/Badge";
import { PageHead } from "@/kernel/ui/PageHead";
import { formatDate, formatHours, humanize, formatMonth } from "@/kernel/ui/format";
import { WORK_REQUEST_STATUS_LABEL, workRequestTone, type WorkRequestStatus } from "@/entities/company-os";
import { loadMyContractorWork, type MyPayment, type MyRate } from "@/entities/portal/lib/my-contractor-work";

export const metadata = {
  title: "My work and pay",
  description: "Your contractor work requests, the hours you reported and each month's payment.",
};

// Pay is shown to the cent: a contractor checks it against their own sums,
// which the whole-dollar formatter used on the admin screens would not match.
function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: (currency || "usd").toUpperCase(), minimumFractionDigits: 2 }).format(cents / 100);
}

function rateLine(rate: MyRate | null): string {
  if (!rate) return "No hourly rate is set for you yet. Ask an admin to add it before your first month is paid.";
  const hourly = `${money(rate.hourlyCents, rate.currency)} an hour`;
  return rate.overtimeCents === null || rate.overtimeCents === rate.hourlyCents ? `${hourly}, overtime at the same rate.` : `${hourly}, overtime at ${money(rate.overtimeCents, rate.currency)}.`;
}

function paymentTone(status: string) {
  if (status === "paid") return "ok" as const;
  if (status === "rejected") return "err" as const;
  if (status === "info_requested") return "warn" as const;
  return "info" as const;
}

function paymentLine(p: MyPayment): string {
  const hours = `${formatHours(p.regularHours)} h${p.overtimeHours > 0 ? ` + ${formatHours(p.overtimeHours)} h overtime` : ""}`;
  if (p.status === "paid") return `${hours} · paid ${formatDate(p.paidAt)}`;
  if (p.status === "info_requested") return `${hours} · we need more information${p.note ? `: ${p.note}` : ""}`;
  if (p.status === "rejected") return `${hours} · not paid${p.note ? `: ${p.note}` : ""}`;
  return `${hours} · waiting to be paid`;
}

// /team/my-work: a contractor's own work requests and monthly payments
// (docs/plans/2026-10-10-contractor-portal.md, PR 1). The permission is held
// by every contractor at scope own, and every read below is filtered to the
// signed-in member, so the page never shows anyone else's work or pay.
export default async function MyWorkPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("portal.contractor-work");
  const actor = await requireTeamMember();
  const { requests, payments, rate } = await loadMyContractorWork(actor.personId, actor.teamMemberId, { assumed: actor.impersonation !== null });

  return (
    <>
      <PageHead title="My work and pay" sub={`Your rate: ${rateLine(rate)} Hours you report on the Contractors board are paid in the following month.`} />

      <section className="admin-card admin-section-card">
        <h2 className="admin-card-title u-mb-3">Payments</h2>
        {payments.length === 0 ? (
          <div className="admin-empty">No payments yet. Each month&apos;s accepted hours are added up on the 1st of the next month.</div>
        ) : (
          <div className="admin-list">
            {payments.map((p) => (
              <div key={p.id} className="admin-list-row">
                <div className="admin-list-main">
                  <div className="admin-list-title">{formatMonth(p.month)}</div>
                  <div className="admin-list-sub">{paymentLine(p)}</div>
                </div>
                <div className="admin-list-aside">
                  <span className="u-strong">{money(p.amountCents, p.currency)}</span>
                  <Badge tone={paymentTone(p.status)}>{p.status === "info_requested" ? "Needs info" : humanize(p.status)}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="admin-card admin-section-card">
        <h2 className="admin-card-title u-mb-3">Work requests</h2>
        {requests.length === 0 ? (
          <div className="admin-empty">No work requests yet. When one is sent to you it appears here and on the Contractors board.</div>
        ) : (
          <div className="admin-list">
            {requests.map((r) => (
              <div key={r.id} className="admin-list-row">
                <div className="admin-list-main">
                  <div className="admin-list-title">{r.openHref ? <a href={r.openHref}>{r.title}</a> : r.title}</div>
                  <div className="admin-list-sub">
                    {r.hours !== null
                      ? `${formatHours(r.hours)} h reported${r.overtimeHours > 0 ? ` + ${formatHours(r.overtimeHours)} h overtime` : ""}`
                      : r.estimatedHours !== null
                        ? `Estimated ${formatHours(r.estimatedHours)} h`
                        : "No estimate yet"}
                    {" · "}sent {formatDate(r.createdAt)}
                  </div>
                </div>
                <div className="admin-list-aside">
                  <Badge tone={workRequestTone(r.status)}>{WORK_REQUEST_STATUS_LABEL[r.status as WorkRequestStatus] ?? humanize(r.status)}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
