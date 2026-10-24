// The tags on one receipt's line, the same on the owner's page and on every
// decider's (RB.11): the client it is to be rebilled to, and the plan's gentle
// label for a receipt bought more than 90 days before the claim went in. The
// label is neutral on purpose: it informs the checker and blocks nothing.
//
// Client-safe: the owner's editable list renders it too.
import { Badge } from "@/kernel/ui/Badge";
import type { MyItem } from "../lib/my-claims";

export function ItemTags({ item }: { item: Pick<MyItem, "rebill" | "rebillCompany" | "olderThan90Days"> }) {
  if (!item.rebill && !item.olderThan90Days) return null;
  return (
    <span className="u-row u-gap-1 u-items-center">
      {item.rebill && <Badge tone="info">Rebill to {item.rebillCompany?.name ?? "a client"}</Badge>}
      {item.olderThan90Days && <Badge title="Bought more than 90 days before the claim. It can still be claimed.">Older than 90 days</Badge>}
    </span>
  );
}

/**
 * A receipt its owner took off a claim that was ever submitted (plan §10,
 * 20261008090000): it stays on the claim for everyone who may see it, with
 * the owner's reason, and counts toward nothing.
 */
export function RemovedNote({ removed }: { removed: MyItem["removed"] }) {
  if (!removed) return null;
  return <div className="admin-alert admin-alert--info">Removed: {removed.reason?.trim() || "no reason given"}</div>;
}

/** A document its owner set aside for another: kept beside its line, satisfying nothing. */
export function ReplacedBadge() {
  return <Badge title="Set aside by the claimant for another document. Kept, and no longer counted.">Replaced</Badge>;
}
