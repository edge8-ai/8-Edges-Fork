// The owner's claims as a list: title, receipts, total, the plan's status line
// and the status badge. Shared by My claims and the profile's panel, so the
// two places that show the same claims show them the same way. The total is
// ClaimTotal, the one every list of claims uses: the figure its decider sees
// too (RB.29), "so far" while a receipt waits for its rate, and how many
// receipts are declined beside the receipt count.
import Link from "next/link";
import { Badge } from "@/kernel/ui/Badge";
import { ClaimTotal } from "./ItemValue";
import { CLAIM_STATUS_LABEL, CLAIM_STATUS_TONE } from "../lib/claim-rules";
import type { MyClaimSummary } from "../lib/my-claims";

export function ClaimList({ claims }: { claims: MyClaimSummary[] }) {
  if (claims.length === 0) return <div className="admin-empty">You have not started a claim yet.</div>;
  return (
    <div className="admin-list">
      {claims.map((c) => (
        <div key={c.id} className="admin-list-row">
          <div className="admin-list-main">
            <div className="admin-list-title">
              <Link href={`/team/claims/${c.id}`}>{c.title}</Link>
            </div>
            <div className="admin-list-sub">
              {c.receipts} receipt{c.receipts === 1 ? "" : "s"}
              {c.declined > 0 ? ` · ${c.declined} declined` : ""} · <span className={c.status === "sent_back" ? "u-warn u-strong" : undefined}>{c.line}</span>
            </div>
          </div>
          <div className="admin-list-aside">
            <ClaimTotal totalVnd={c.totalVnd} ratePending={c.ratePending} word={c.figureWord} />
            <Badge tone={CLAIM_STATUS_TONE[c.status]}>{CLAIM_STATUS_LABEL[c.status]}</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
