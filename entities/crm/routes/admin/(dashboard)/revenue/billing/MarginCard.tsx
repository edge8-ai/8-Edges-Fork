import { ChartCard, DashEmpty } from "@/kernel/ui/dash/StatTile";
import { compactUsd } from "@/entities/company-os";
import type { ClientMetrics } from "@/entities/crm/lib/revenue-metrics/clients";

// Gross margin by kind (RF-4). A server component, extracted so the Billing
// page stays inside the file-size cap and so the "we do not know the cost"
// case has one home rather than being repeated on two screens.
//
// The case matters more than the happy path: when nothing has been attributed
// to any client, this card says so and prints no margin at all. Subtracting a
// cost of zero would render a 100% margin, which is not a finding about the
// business — it is a finding about the data, and saying it as a percentage
// would be the single most misleading number on the hub.

export function MarginCard({ clients, periodLabel, thinPct }: { clients: ClientMetrics; periodLabel: string; thinPct: number }) {
  const usd = (n: number) => compactUsd(n * 100);
  // The totals come from the aggregate, not from re-adding the column here, so
  // this card and the clients table can never reach different numbers.
  const { totalCost, totalMargin, totalMarginPct, unmappedCost, costKnown, costTrusted, fullyAttributed, billedUnattributed } = clients;
  const { untaggedExpenses, unassignedPayments } = clients.costGaps;
  // A cost figure is printed only when the read behind it succeeded. Showing
  // an unmapped row while the total says "—" would be one card asserting a
  // figure its own total denies.
  const showCost = costTrusted && costKnown;
  const showUnmapped = showCost && unmappedCost > 0;
  // A cost cell says "—" rather than "$0" when nothing is attributed to it:
  // printing a definite zero beside a margin that refuses to stand behind it
  // invites the reader to do the subtraction the card declined to do.
  const showCostFor = (n: number) => showCost && n > 0;
  const cost = (n: number) => (showCostFor(n) ? usd(n) : "—");
  const costOf = (n: number) => (showCostFor(n) ? n : "");

  // Untagged spend is named but never added to a margin: nothing on a
  // QuickBooks P&L category row says whether it was incurred serving a client,
  // so counting "Taxes paid" as unmapped delivery cost would make every margin
  // look worse than the evidence supports.
  const untaggedLine =
    clients.untaggedSpend > 0
      ? ` Separately, ${usd(clients.untaggedSpend)} of spend across ${untaggedExpenses} ${untaggedExpenses === 1 ? "row" : "rows"} is not classified as delivery cost or overhead, and is not counted above.`
      : "";
  const note = !costTrusted
    ? "The delivery-cost read failed, so every margin here reads unknown rather than a number computed on half the cost. The failure is named above."
    : !costKnown
      ? `No delivery cost is attributed to any client yet, so margin is unknown rather than 100%. Tag an expense with its client, or record a contractor payment against someone with a client assignment, and this card starts answering.${untaggedLine}${unassignedPayments > 0 ? ` ${unassignedPayments} contractor payments have no client assignment for their month.` : ""}`
      : !fullyAttributed
        ? `Delivery cost is contractor payments and expenses attributed to the client, by month, and ${usd(billedUnattributed)} of the period's billing still has none behind it. A kind and the total therefore read unknown: subtracting the cost of the tagged clients from the billing of all of them would be a number nothing supports. Tag the rest and these rows start answering — a client whose QuickBooks customer is unmapped needs mapping first, because cost reaches a client through its company.${untaggedLine}`
        : `Delivery cost is contractor payments and expenses attributed to the client, by month. Margin % turns amber under ${thinPct}%. Unmapped cost is in the All row, so the total is never quietly flattering.${untaggedLine}`;

  return (
    <ChartCard
      title="Gross margin · by kind"
      span={12}
      meta={!costTrusted ? "cost unavailable" : !costKnown ? "cost not attributed yet" : !fullyAttributed ? "cost partly attributed" : `billed minus delivery cost · ${periodLabel}`}
      note={note}
      download={{
        name: "Gross margin by kind",
        // Exactly the rows the table renders, in the same order and with the
        // same blanks: the unmapped row only when it is shown, and the All row,
        // which the table has and an export without it would be missing.
        rows: [
          // `costOf` is the table's own cell rule, so a row whose cost is
          // blank on screen is blank in the file too. Exporting a literal 0
          // where the table says "—" is the drift this link exists to avoid.
          ...clients.byKind.map((k) => ({ kind: k.kind, billed: k.billed, cost: costOf(k.cost), margin: k.margin ?? "", marginPct: k.marginPct ?? "", sharePct: k.share })),
          ...(showUnmapped ? [{ kind: "Unmapped cost", billed: "", cost: unmappedCost, margin: -unmappedCost, marginPct: "", sharePct: "" }] : []),
          { kind: "All", billed: clients.totalBilled, cost: costOf(totalCost), margin: totalMargin ?? "", marginPct: totalMarginPct ?? "", sharePct: 100 },
        ],
      }}
    >
      {clients.totalBilled === 0 ? (
        <DashEmpty>Nothing was invoiced in this period, so there is no margin to show.</DashEmpty>
      ) : (
        <table className="dash-table">
          <thead>
            <tr>
              <th>Kind</th>
              <th className="n">Billed</th>
              <th className="n">Delivery cost</th>
              <th className="n">Margin</th>
              <th className="n">Margin %</th>
              <th className="n">Share</th>
            </tr>
          </thead>
          <tbody>
            {clients.byKind.map((k) => (
              <tr key={k.kind}>
                <td>{k.kind}</td>
                <td className="n">{usd(k.billed)}</td>
                <td className="n">{cost(k.cost)}</td>
                <td className="n">{k.margin == null ? "—" : usd(k.margin)}</td>
                <td className={`n${k.marginPct != null && k.marginPct < thinPct ? " is-warn" : ""}`}>{k.marginPct == null ? "unknown" : `${k.marginPct}%`}</td>
                <td className="n">{k.share}%</td>
              </tr>
            ))}
            {showUnmapped && (
              <tr className="is-muted">
                <td>
                  Unmapped cost
                  <span className="sub">cost that names no client, or no kind</span>
                </td>
                <td className="n">—</td>
                <td className="n">{usd(unmappedCost)}</td>
                <td className="n">−{usd(unmappedCost)}</td>
                <td className="n">—</td>
                <td className="n">—</td>
              </tr>
            )}
            <tr className="is-total">
              <td>All</td>
              <td className="n">{usd(clients.totalBilled)}</td>
              <td className="n">{cost(totalCost)}</td>
              <td className="n">{totalMargin == null ? "—" : usd(totalMargin)}</td>
              <td className={`n${totalMarginPct != null && totalMarginPct < thinPct ? " is-warn" : ""}`}>{totalMarginPct == null ? "unknown" : `${totalMarginPct}%`}</td>
              <td className="n">100%</td>
            </tr>
          </tbody>
        </table>
      )}
    </ChartCard>
  );
}
