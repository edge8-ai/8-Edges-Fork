// The payment runs as a list (plan section 8): each run's date, how many
// people and claims it pays, its total and whether it is paid. The Team
// Finance group and the Admin mirror render the same list with their own
// links, so a payer who works in Admin stays in Admin.
import Link from "next/link";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate, formatVndWhole } from "@/kernel/ui/format";
import type { RunSummary } from "../lib/run-view";

export function PaymentRunList({ runs, hrefBase }: { runs: RunSummary[]; hrefBase: string }) {
  if (runs.length === 0) return <div className="admin-empty">No payment run has been built yet. The first is built on the next 1st or 15th with approved claims.</div>;
  return (
    <div className="admin-list">
      {runs.map((r) => (
        <div key={r.id} className="admin-list-row">
          <div className="admin-list-main">
            <div className="admin-list-title">
              <Link href={`${hrefBase}/${r.id}`}>Payment run · {formatDate(r.runDate)}</Link>
            </div>
            <div className="admin-list-sub">
              {r.people} {r.people === 1 ? "person" : "people"} · {r.claims} {r.claims === 1 ? "claim" : "claims"}
              {r.paidAt ? ` · paid ${formatDate(r.paidAt)}` : ""}
            </div>
          </div>
          <div className="admin-list-aside">
            <span className="admin-cell-mono">{formatVndWhole(r.totalVnd)}</span>
            <Badge tone={r.status === "paid" ? "ok" : "warn"}>{r.status === "paid" ? "Paid" : "To pay"}</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
