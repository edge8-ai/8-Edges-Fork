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

export function ItemValue({ item, declined = false }: { item: ItemMoney; declined?: boolean }) {
  const line = rateLine(item);
  return (
    <span className="u-stack u-gap-1">
      {item.amountVnd === null ? (
        <Badge tone="warn" title="No bank had a rate for this day yet. A checker can enter it by hand.">
          Rate pending
        </Badge>
      ) : declined ? (
        // Declined, so it is not in the claim's total (RB.29): <s>, an amount no longer counted, so the page adds up.
        <s className="admin-cell-mono u-muted">{formatVndWhole(item.amountVnd)}</s>
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

/** How many receipts a figure waits on for a rate, in words. */
function waitingForRate(n: number): string {
  return n === 1 ? "1 receipt waiting for its rate" : `${n} receipts waiting for their rates`;
}

/**
 * A claim's figure in VND as a list or a claim's header shows it (RB.29), the
 * same figure for its owner and its decider (claim-figure.ts). While a kept
 * receipt waits for its rate the sum leaves it out, so the figure says "so
 * far" and how many it waits on. A settlement's figure says it is what was
 * spent, and Admin's run tabs say a settlement's figure is what a run pays.
 */
export function ClaimTotal({
  totalVnd,
  ratePending = 0,
  word = null,
  large = false,
}: {
  totalVnd: number;
  ratePending?: number;
  word?: "spent" | "to pay" | null;
  large?: boolean;
}) {
  const figure = <span className={large ? "admin-cell-mono u-lg u-strong" : "admin-cell-mono"}>{formatVndWhole(totalVnd)}</span>;
  const suffix = [word, ratePending > 0 ? "so far" : null].filter(Boolean).join(" ");
  const named = suffix ? (
    <span className="u-row u-gap-1 u-items-center">
      {figure}
      <span className={large ? "u-muted u-sm" : "u-muted u-xs"}>{suffix}</span>
    </span>
  ) : (
    figure
  );
  if (ratePending <= 0) return named;
  return (
    <span className="u-stack u-gap-1 u-items-end">
      {named}
      <Badge tone="warn" title="The figure leaves these receipts out until each has a rate.">
        {waitingForRate(ratePending)}
      </Badge>
    </span>
  );
}
