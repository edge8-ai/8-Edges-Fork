// One receipt's money as every view of a claim shows it (RB.10): its value in
// VND, or "Rate pending" while no rate is known, and under it, for a receipt
// abroad, the amount as it was paid and the rate behind the figure. The
// owner's page and the checker's render the same component, so the two can
// never disagree about what a receipt is worth or why.
//
// Client-safe: no hooks and no server import, so a client island renders it.
import { Badge } from "@/kernel/ui/Badge";
import { formatVndWhole } from "@/kernel/ui/format";
import { rateLine, type ItemMoney } from "../lib/claim-labels";

export function ItemValue({ item }: { item: ItemMoney }) {
  const line = rateLine(item);
  return (
    <span className="u-stack u-gap-1">
      {item.amountVnd === null ? (
        <Badge tone="warn" title="No bank had a rate for this day yet. A checker can enter it by hand.">
          Rate pending
        </Badge>
      ) : (
        <span className="admin-cell-mono u-strong">{formatVndWhole(item.amountVnd)}</span>
      )}
      {line && <span className="admin-list-sub">{line}</span>}
    </span>
  );
}

/**
 * The owner's written explanation for a receipt lost abroad, highlighted (plan
 * section 10): a checker must read it before passing the line, because it
 * stands in for the document.
 */
export function LostReceiptNote({ note }: { note: string }) {
  return (
    <div className="admin-alert admin-alert--info" role="note">
      <Badge tone="warn">No receipt</Badge> <strong>Lost abroad. The owner explains:</strong> {note}
    </div>
  );
}

/**
 * A claim's total in VND as a list or a claim's header shows it. While a kept
 * receipt's rate is pending the sum leaves it out, so the figure is marked as
 * not yet the whole claim instead of standing as its total (RB.10).
 */
export function ClaimTotal({ totalVnd, ratePending = 0, large = false }: { totalVnd: number; ratePending?: number; large?: boolean }) {
  const figure = <span className={large ? "admin-cell-mono u-lg u-strong" : "admin-cell-mono"}>{formatVndWhole(totalVnd)}</span>;
  if (ratePending <= 0) return figure;
  return (
    <span className="u-row u-gap-1 u-items-center">
      {figure}
      <Badge tone="warn" title="The total leaves these receipts out until each has a rate.">
        + {ratePending === 1 ? "1 receipt" : `${ratePending} receipts`}, rate pending
      </Badge>
    </span>
  );
}
