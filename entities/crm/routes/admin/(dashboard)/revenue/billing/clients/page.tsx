import { requirePermission } from "@/kernel/identity/access-request";
import { Suspense } from "react";
import Link from "next/link";
import { PageHead } from "@/kernel/ui/PageHead";
import { ChartCard, DashEmpty, DashErrors, DashSkeleton } from "@/kernel/ui/dash/StatTile";
import { compactUsd } from "@/entities/company-os";
import { loadClients, THIN_MARGIN_PCT, type ClientRow } from "@/entities/crm/lib/revenue-metrics/clients";
import { parseRange, RANGE_LABELS } from "@/entities/crm/lib/revenue-metrics/shared";
import { RevenueTabs } from "../../RevenueTabs";

export const metadata = {
  title: "Revenue · Clients",
  description: "One row per client for the period: what was billed, what it cost to deliver, the margin, and the share of the whole.",
};

type SearchParams = Record<string, string | string[] | undefined>;

// The clients revenue-and-margin table (RF-4), reached from the "Revenue by
// client" card on Billing. The whole list, sortable, downloadable — and honest
// about cost it cannot attribute, which appears as its own row rather than
// being left out of a total that would then look better than the truth.

const SORTS = { billed: "Billed", margin: "Margin", share: "Share" } as const;
type Sort = keyof typeof SORTS;
const parseSort = (v: string | string[] | undefined): Sort => {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "margin" || s === "share" ? s : "billed";
};

export default async function ClientsRevenuePage(props: { searchParams: Promise<SearchParams> }) {
  await requirePermission("crm.billing");
  const searchParams = await props.searchParams;
  const range = parseRange(searchParams.range);
  const sort = parseSort(searchParams.sort);
  return (
    <>
      <PageHead
        eyebrow="Four Offices · Revenue · Billing"
        title="Clients · revenue and margin"
        sub="One row per client for the period: what was billed, what it cost to deliver, and the share of the whole."
      />
      <RevenueTabs range={range} />
      <Suspense fallback={<DashSkeleton cards={1} />}>
        <ClientsSection range={range} sort={sort} />
      </Suspense>
    </>
  );
}

// Sorting is a link per column, not client state: the sorted view is then a
// URL somebody can send, which is the hub's convention everywhere else.
function sortRows(rows: ClientRow[], sort: Sort): ClientRow[] {
  if (sort === "margin") return [...rows].sort((a, b) => (b.margin ?? -Infinity) - (a.margin ?? -Infinity) || a.name.localeCompare(b.name));
  if (sort === "share") return [...rows].sort((a, b) => b.share - a.share || a.name.localeCompare(b.name));
  return [...rows].sort((a, b) => b.billed - a.billed || a.name.localeCompare(b.name));
}

async function ClientsSection({ range, sort }: { range: ReturnType<typeof parseRange>; sort: Sort }) {
  const m = await loadClients(range, new Date());
  const usd = (n: number) => compactUsd(n * 100);
  const periodLabel = RANGE_LABELS[range].toLowerCase();
  const rows = sortRows(m.clients, sort);
  const href = (s: Sort) => `/admin/revenue/billing/clients?range=${range}${s === "billed" ? "" : `&sort=${s}`}`;
  const showCost = m.costTrusted && m.costKnown;
  const showUnmapped = showCost && m.unmappedCost > 0;
  // "—" rather than "$0" for a row with nothing attributed: a definite zero
  // beside an unknown margin is a subtraction waiting to be done.
  const showCostFor = (n: number) => showCost && n > 0;
  const costCell = (n: number) => (showCostFor(n) ? usd(n) : "—");
  // The export applies the table's own cell rule, so a blank on screen is a
  // blank in the file rather than a literal 0 the table declined to assert.
  const costOf = (n: number) => (showCostFor(n) ? n : "");

  return (
    <>
      <DashErrors errors={m.errors} />
      <div className="dash-grid">
        <ChartCard
          title={`${periodLabel} · ${m.clients.length} ${m.clients.length === 1 ? "client" : "clients"}`}
          span={12}
          meta={
            <span className="dash-sorts">
              {(Object.keys(SORTS) as Sort[]).map((s) => (
                <Link key={s} href={href(s)} className={s === sort ? "is-on" : undefined}>
                  {SORTS[s]}
                </Link>
              ))}
            </span>
          }
          note={
            !m.costTrusted
              ? "The delivery-cost read failed, so every margin here reads unknown rather than a number computed on half the cost. The failure is named above."
              : !m.costKnown
                ? `No delivery cost is attributed to any client yet, so every margin here is unknown rather than equal to what was billed. Tag an expense with its client, or record a contractor payment against someone with a client assignment, and these columns start answering.${m.untaggedSpend > 0 ? ` ${usd(m.untaggedSpend)} of spend is not classified as delivery cost or overhead and is deliberately not counted here.` : ""}`
                : `A client shows a margin only when that client's own cost is attributed; one nobody has tagged reads unknown rather than 100%. ${m.fullyAttributed ? `Margin % turns amber under ${THIN_MARGIN_PCT}%.` : `${usd(m.billedUnattributed)} of the period's billing still has no cost behind it, so the All row reads unknown too. A client shown as "not mapped to a company" cannot receive cost at all until its QuickBooks customer is mapped; tagging alone will not release it.`} Delivery cost reaches a client through the client named on the expense, or the client that person was assigned to. The "Unmapped cost" row is delivery cost nothing claims, and the All row carries it.${m.untaggedSpend > 0 ? ` A further ${usd(m.untaggedSpend)} of spend is classified as neither delivery cost nor overhead and is deliberately not counted here.` : ""}`
          }
          download={{
            name: `Clients revenue and margin ${range}`,
            // Exactly the rows the table renders, including its All row: an
            // export missing the total is an export the reader has to re-add.
            rows: [
              ...rows.map((c) => ({ client: c.name, kinds: c.kinds, billed: c.billed, deliveryCost: costOf(c.cost), margin: c.margin ?? "", marginPct: c.marginPct ?? "", sharePct: c.share })),
              ...(showUnmapped ? [{ client: "Unmapped cost", kinds: "", billed: "", deliveryCost: m.unmappedCost, margin: -m.unmappedCost, marginPct: "", sharePct: "" }] : []),
              { client: "All", kinds: "", billed: m.totalBilled, deliveryCost: costOf(m.totalCost), margin: m.totalMargin ?? "", marginPct: m.totalMarginPct ?? "", sharePct: 100 },
            ],
          }}
        >
          {rows.length === 0 ? (
            <DashEmpty>Nothing was invoiced in the last {periodLabel}.</DashEmpty>
          ) : (
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th className="n">Billed</th>
                  <th className="n">Delivery cost</th>
                  <th className="n">Margin</th>
                  <th className="n">Margin %</th>
                  <th className="n">Share</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.companyId ?? c.name}>
                    <td>
                      {c.companyId ? <Link href={`/admin/revenue/companies/${c.companyId}`}>{c.name}</Link> : c.name}
                      <span className="sub">{c.companyId ? c.kinds : `${c.kinds} · not mapped to a company`}</span>
                    </td>
                    <td className="n">{usd(c.billed)}</td>
                    <td className="n">{costCell(c.cost)}</td>
                    <td className="n">{c.margin == null ? "—" : usd(c.margin)}</td>
                    <td className={`n${c.marginPct != null && c.marginPct < THIN_MARGIN_PCT ? " is-warn" : ""}`}>{c.marginPct == null ? "unknown" : `${c.marginPct}%`}</td>
                    <td className="n">{c.share}%</td>
                  </tr>
                ))}
                {showUnmapped && (
                  <tr className="is-muted">
                    <td>
                      Unmapped cost
                      <span className="sub">contractor payments that reach no client</span>
                    </td>
                    <td className="n">—</td>
                    <td className="n">{usd(m.unmappedCost)}</td>
                    <td className="n">−{usd(m.unmappedCost)}</td>
                    <td className="n">—</td>
                    <td className="n">—</td>
                  </tr>
                )}
                <tr className="is-total">
                  <td>All</td>
                  <td className="n">{usd(m.totalBilled)}</td>
                  <td className="n">{costCell(m.totalCost)}</td>
                  <td className="n">{m.totalMargin == null ? "—" : usd(m.totalMargin)}</td>
                  <td className={`n${m.totalMarginPct != null && m.totalMarginPct < THIN_MARGIN_PCT ? " is-warn" : ""}`}>{m.totalMarginPct == null ? "unknown" : `${m.totalMarginPct}%`}</td>
                  <td className="n">100%</td>
                </tr>
              </tbody>
            </table>
          )}
        </ChartCard>
      </div>
    </>
  );
}
