import { requirePermission } from "@/kernel/identity/access-request";
import { Suspense } from "react";
import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import { PageHead } from "@/kernel/ui/PageHead";
import { formatDate } from "@/kernel/ui/format";
import { ChartCard, DashEmpty, DashErrors, DashSkeleton, ProgressBar, StatTile } from "@/kernel/ui/dash/StatTile";
import { HBars } from "@/kernel/ui/dash/HBars";
import { Columns } from "@/kernel/ui/dash/Columns";
import { compactUsd } from "@/entities/company-os";
import { loadBilling } from "@/entities/crm/lib/revenue-metrics/billing";
import { loadClients, CONCENTRATION_WARN_PCT, THIN_MARGIN_PCT } from "@/entities/crm/lib/revenue-metrics/clients";
import { loadCollections } from "@/entities/crm/lib/revenue-metrics/collections";
import { loadTargets, periodLabelOf, periodProgress, targetFor } from "@/entities/crm/lib/revenue-metrics/targets";
import { parseRange, RANGE_LABELS } from "@/entities/crm/lib/revenue-metrics/shared";
import { RevenueTabs } from "../RevenueTabs";
import { CollectionsCard } from "./CollectionsCard";
import { MarginCard } from "./MarginCard";
import { logCollectionsChase } from "./collections-actions";
import { INVOICE_OVERDUE, INVOICE_PAID, INVOICE_VOIDED } from "@/entities/finance";

export const metadata = {
  title: "Revenue · Billing",
  description: "What was invoiced by month, what will come in over the next quarter, who the money comes from and what it cost to earn, receivables by age, and the collections queue.",
};

type SearchParams = Record<string, string | string[] | undefined>;

// The Billing tab (RH-4 v2, widened by RF-1/2/4/5/8 on 2026-09-14). Invoices
// are QuickBooks' mirror; the kind, the deal link and the client attribution
// on an expense are ours, and every card that shows rows offers them as a CSV.
export default async function BillingPage(props: { searchParams: Promise<SearchParams> }) {
  await requirePermission("crm.billing");
  const searchParams = await props.searchParams;
  const range = parseRange(searchParams.range);
  return (
    <>
      <PageHead
        eyebrow="Four Offices · Revenue"
        title="Billing"
        sub="Invoiced by month, what will come in over the next quarter, who the money comes from and what it cost to earn, receivables by age, and the collections queue."
      />
      <RevenueTabs range={range} />
      <Suspense fallback={<DashSkeleton cards={8} />}>
        <BillingSection range={range} />
      </Suspense>
    </>
  );
}

const SHOW_ROWS = 12;

async function BillingSection({ range }: { range: ReturnType<typeof parseRange> }) {
  const now = new Date();
  const [m, clients, targets] = await Promise.all([loadBilling(range, now), loadClients(range, now), loadTargets()]);
  const collections = await loadCollections(m.overdue, now);
  const usd = (n: number) => compactUsd(n * 100);
  const periodLabel = RANGE_LABELS[range].toLowerCase();
  const count = m.byMonth.reduce((a, p) => a + p.count, 0);
  const months = Math.max(1, m.byMonth.length);
  const overdueTotal = m.overdue.reduce((a, o) => a + o.balance, 0);
  const invTarget = targetFor(targets.rows, "invoiced_usd", "month", now);
  const thisMonth = m.byMonth[m.byMonth.length - 1]?.amount ?? 0;
  // Won deals with a bar to show first; the unlinked ones would be a column
  // of dashes, so they are counted in the note and linked, not listed.
  const billedRows = m.wonBilled.filter((r) => r.invoices > 0);
  const concentrated = clients.largestSharePct != null && clients.largestSharePct > CONCENTRATION_WARN_PCT;
  // Built once, drawn and downloaded from the same array. Two company records
  // with the same name are two rows, so the label disambiguates them — HBars
  // keys on the label, and that collision is the case the card's note names.
  const clientBars = clients.topWithOthers.map((c, i) => ({
    label: clients.topWithOthers.findIndex((o) => o.name === c.name) === i ? c.name : `${c.name} (record ${i + 1})`,
    value: c.billed,
    cost: c.cost,
    share: c.share,
    tone: (c.share > CONCENTRATION_WARN_PCT ? "warn" : c.companyId === null && c.name.startsWith("Others") ? "muted" : undefined) as "warn" | "muted" | undefined,
  }));

  return (
    <>
      <DashErrors errors={[...m.errors, ...clients.errors, ...collections.errors, ...targets.errors]} />
      <div className="dash-grid">
        <StatTile
          label={`Invoiced · ${periodLabel}`}
          value={usd(m.invoicedInRange.value)}
          raw={thisMonth}
          sub={`${count} invoices · about ${usd(Math.round(m.invoicedInRange.value / months))} a month`}
          delta={{ ...m.invoicedInRange, format: "usd", priorLabel: `prior ${periodLabel}` }}
          target={invTarget ? { amount: invTarget.amount, format: "usd", progress: periodProgress("month", now), label: `${periodLabelOf("month", now)} target` } : undefined}
          href="/admin/revenue/invoices"
        />
        <StatTile label="Recurring · last month" value={usd(m.recurringLastMonth)} sub={m.recurringShare == null ? "no invoices classified yet" : `${m.recurringShare}% of the ${periodLabel} was recurring`} href="/admin/revenue/invoices" />
        <StatTile label="Receivable open" value={usd(m.openBalance)} tone={m.overdue.length ? "warn" : undefined} sub={`${usd(overdueTotal)} past due across ${m.overdue.length} invoices`} href="/admin/revenue/invoices?status=overdue" />
        <StatTile label="Won deals without an invoice" value={m.wonWithoutInvoice} tone={m.wonWithoutInvoice ? "warn" : "ok"} sub={`of ${m.wonBilled.length} won deals · link from the deal detail`} href="/admin/revenue/deals?focus=won-unbilled" />
      </div>

      <div className="dash-grid">
        <StatTile
          label="Cash in · next 90 days"
          value={usd(m.cash.total)}
          sub={`${usd(m.cash.due)} invoices due · ${usd(m.cash.recurring)} recurring run rate · ${usd(m.cash.expected)} weighted closes`}
          href="/admin/revenue/invoices"
        />
        <StatTile
          label="Largest client share"
          value={clients.largestSharePct == null ? "—" : `${clients.largestSharePct}%`}
          tone={concentrated ? "warn" : undefined}
          sub={clients.largest ? `${clients.largest.name} · ${usd(clients.largest.billed)} of the ${periodLabel}${clients.top3SharePct != null ? ` · top 3 hold ${clients.top3SharePct}%` : ""}` : "nothing invoiced in this period"}
          href="/admin/revenue/billing/clients"
        />
      </div>

      <div className="dash-grid">
        <ChartCard
          title="Cash in · next 90 days"
          span={8}
          meta={`${usd(m.cash.total)} · by month`}
          note={`Three certainties stacked: what is invoiced and due, what the recurring book bills every month, and what the open deals say will close, weighted by probability. Ninety days is ninety days — the period picker above does not move this card. Recurring assumes last month repeats and counts only the part not already invoiced, so a retainer billed this month is not counted twice; a lost retainer changes it the next night.${m.cash.undatedBalance > 0 ? ` ${usd(m.cash.undatedBalance)} of open balance has no due date and is not in this figure.` : ""}`}
          download={{ name: "Cash forecast", rows: m.cash.months.map((p) => ({ month: p.month, due: p.due, recurring: p.recurring, expected: p.expected, total: p.total })) }}
        >
          <Columns
            labels={m.cash.months.map((p) => p.label)}
            series={[
              { name: "invoices already due", values: m.cash.months.map((p) => p.due) },
              { name: "recurring run rate", values: m.cash.months.map((p) => p.recurring), tone: "ok" },
              { name: "expected closes, weighted", values: m.cash.months.map((p) => p.expected), tone: "warn" },
            ]}
            format="usd"
            stacked
            emptyText="Nothing due, no recurring book and no dated deals: there is no forecast to draw."
          />
        </ChartCard>
        <ChartCard title="Receivable · by age" span={4} meta={usd(m.openBalance)} note="Open balances by how far past due they are. Current is not yet due." download={{ name: "Receivable by age", rows: m.arAging.map((b) => ({ bucket: b.label, usd: b.value })) }}>
          <HBars rows={m.arAging.map((b, i) => ({ ...b, tone: i === 0 ? "ok" : i >= 3 ? "warn" : undefined }))} format="usd" emptyText="Nothing is owed." />
        </ChartCard>

        <ChartCard
          title="Revenue · by client"
          span={8}
          meta={`${periodLabel} · share of ${usd(clients.totalBilled)}`}
          note={`Amber when one client is above ${CONCENTRATION_WARN_PCT}% of the period. Two records for one client split its bar; the Data health duplicate check catches those.`}
          more={{ href: "/admin/revenue/billing/clients", label: `All ${clients.clients.length} clients, with margin` }}
          // The rows the BARS draw, with the same disambiguated labels and the
          // same cost gate the tables use: an export of concrete cost figures
          // under a card that says "cost unavailable" is the drift this link
          // exists to avoid. The whole list, with margins, is on the clients page.
          download={{ name: "Revenue by client", rows: clientBars.map((b) => ({ client: b.label, billed: b.value, cost: clients.costTrusted && clients.costKnown && b.cost > 0 ? b.cost : "", sharePct: b.share })) }}
        >
          <HBars
            rows={clientBars.map((b) => ({ label: b.label, value: b.value, extra: `${b.share}%`, tone: b.tone }))}
            format="usd"
            emptyText={`No invoices in the last ${periodLabel}.`}
          />
        </ChartCard>
        <ChartCard title="Invoices · by status" span={4} meta={`${m.invoices} total`} download={{ name: "Invoices by status", rows: m.byStatus.map((b) => ({ status: b.label, invoices: b.value })) }}>
          <HBars rows={m.byStatus.map((b) => ({ ...b, tone: b.label === INVOICE_PAID ? "ok" : b.label === INVOICE_OVERDUE ? "warn" : b.label === INVOICE_VOIDED ? "muted" : undefined }))} />
        </ChartCard>

        <MarginCard clients={clients} periodLabel={periodLabel} thinPct={THIN_MARGIN_PCT} />

        <ChartCard title="Invoiced · by transaction month" span={12} meta="USD, QuickBooks mirror" note={`${m.unclassified ? `${m.unclassified} invoices have no kind yet and count as project until the sync can read their line items.` : "Recurring is read off each invoice's line items by the QuickBooks sync."}${m.foreignInvoices ? ` ${m.foreignInvoices} ${m.foreignInvoices === 1 ? "invoice is" : "invoices are"} in another currency and count as nothing here: the mirror carries no USD figure for them, and adding a foreign amount at par would be a wrong number rather than a missing one.` : ""}`} download={{ name: "Invoiced by month", rows: m.byMonth.map((p) => ({ month: p.month, invoices: p.count, total: p.amount, recurring: p.recurring, project: p.project })) }}>
          <Columns
            labels={m.byMonth.map((p) => p.label)}
            series={[
              { name: "recurring", values: m.byMonth.map((p) => p.recurring) },
              { name: "project", values: m.byMonth.map((p) => p.project), tone: "muted" },
            ]}
            format="usd"
            emptyText={`No invoices in the last ${periodLabel}.`}
          />
        </ChartCard>

        <CollectionsCard collections={collections} overdueTotal={overdueTotal} logChase={logCollectionsChase} />

        <ChartCard
          title="Won deals · billed so far"
          span={12}
          meta={`${billedRows.length} of ${m.wonBilled.length} won deals have a linked invoice`}
          note={
            <>
              {m.wonWithoutInvoice} won {m.wonWithoutInvoice === 1 ? "deal has" : "deals have"} no invoice linked yet and {m.wonWithoutInvoice === 1 ? "is" : "are"} not listed; a missing link is not a missing payment.{" "}
              <Link href="/admin/revenue/deals?focus=won-unbilled">Link them from the deal detail →</Link>
            </>
          }
          download={{ name: "Won deals billed", rows: m.wonBilled.map((r) => ({ deal: r.title, closedAt: r.closedAt ?? "", wonUsd: r.wonUsd, billedUsd: r.billedUsd, invoices: r.invoices })) }}
        >
          {billedRows.length === 0 ? (
            <DashEmpty>No won deal has an invoice linked yet. Open a won deal and link its invoices in the Billing section.</DashEmpty>
          ) : (
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Deal</th>
                  <th className="n">Won</th>
                  <th className="n">Billed</th>
                  <th>Progress</th>
                  <th className="n">Invoices</th>
                </tr>
              </thead>
              <tbody>
                {billedRows.slice(0, SHOW_ROWS).map((r) => (
                  <tr key={r.dealId}>
                    <td>
                      <Link href={`/admin/revenue/deals/${r.dealId}`}>{r.title}</Link>
                      <span className="sub">closed {formatDate(r.closedAt)}</span>
                    </td>
                    <td className="n">{usd(r.wonUsd)}</td>
                    <td className="n">{usd(r.billedUsd)}</td>
                    <td>
                      <ProgressBar value={r.billedUsd} max={r.wonUsd} label={`${usd(r.billedUsd)} of ${usd(r.wonUsd)}`} />
                    </td>
                    <td className="n">{r.invoices}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ChartCard>
      </div>
    </>
  );
}
