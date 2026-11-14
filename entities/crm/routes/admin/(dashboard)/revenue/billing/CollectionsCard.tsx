import { ChartCard, DashEmpty } from "@/kernel/ui/dash/StatTile";
import { formatDate, timeAgo } from "@/kernel/ui/format";
import { compactUsd } from "@/entities/company-os";
import { CHASE_STALE_DAYS, type Collections } from "@/entities/crm/lib/revenue-metrics/collections";
import { LogChase, type LogChaseAction } from "./LogChase";

// The collections queue (RF-5): every overdue invoice, how long it has been
// overdue, when its client was last chased and what was agreed next.
//
// A server component that hands the write action down to the small client
// control on each row, because a client door may never reach a "use server"
// module. Nothing in this table names a person.

const SHOW_ROWS = 20;

export function CollectionsCard({ collections, overdueTotal, logChase }: { collections: Collections; overdueTotal: number; logChase: LogChaseAction }) {
  const usd = (n: number) => compactUsd(n * 100);
  const rows = collections.rows;
  return (
    <ChartCard
      title="Collections"
      span={12}
      meta={rows.length ? `${rows.length} overdue · ${usd(overdueTotal)} · sorted by days late` : undefined}
      note={`"Log a chase" writes one interaction on the invoice's company with a note and an optional next date; the table reads the latest one back. A row with no chase in ${CHASE_STALE_DAYS} days turns amber, never chased turns red. ${collections.neverChased} of ${rows.length} have never been chased.`}
      more={rows.length > SHOW_ROWS ? { href: "/admin/revenue/invoices?status=overdue", label: `All ${rows.length} overdue invoices` } : undefined}
      download={{
        name: "Collections queue",
        rows: rows.map((r) => ({ invoice: r.docNumber, client: r.customer, due: r.dueDate ?? "", daysLate: r.daysOverdue, balance: r.balance, lastChased: r.lastChasedAt ?? "", channel: r.channel ?? "", nextStep: r.nextStep ?? "" })),
      }}
    >
      {rows.length === 0 ? (
        <DashEmpty>Nothing overdue.</DashEmpty>
      ) : (
        <table className="dash-table dash-collections">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Due</th>
              <th className="n">Days late</th>
              <th className="n">Balance</th>
              <th>Last chased</th>
              <th>Next step</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, SHOW_ROWS).map((r) => (
              <tr key={r.id} className={r.tone ? `is-${r.tone}` : undefined}>
                <td>
                  {r.docNumber}
                  <span className="sub">{r.customer}</span>
                </td>
                <td>{formatDate(r.dueDate)}</td>
                <td className="n">{r.daysOverdue}</td>
                <td className="n">{usd(r.balance)}</td>
                <td className={r.tone ? `is-${r.tone}` : undefined}>{r.lastChasedAt ? `${timeAgo(r.lastChasedAt)}${r.channel ? ` · ${r.channel}` : ""}` : "never"}</td>
                <td>
                  <span className="dash-clamp" title={r.nextStep ?? undefined}>
                    {r.nextStep || "none set"}
                  </span>
                </td>
                <td>
                  <LogChase companyId={r.companyId} invoiceRef={r.docNumber} logChase={logChase} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ChartCard>
  );
}
