// The owner's claims as a list: title, receipts, total, the plan's status line
// and the status badge. Shared by My claims and the profile's panel, so the
// two places that show the same claims show them the same way. The total is
// ClaimTotal, the one every list of claims uses: while a receipt's rate is
// pending it says so beside the figure, rather than counting it as nothing.
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
              {c.receipts} receipt{c.receipts === 1 ? "" : "s"} · <span className={c.status === "sent_back" ? "u-warn u-strong" : undefined}>{c.line}</span>
            </div>
          </div>
          <div className="admin-list-aside">
            <ClaimTotal totalVnd={c.totalVnd} ratePending={c.ratePending} />
            <Badge tone={CLAIM_STATUS_TONE[c.status]}>{CLAIM_STATUS_LABEL[c.status]}</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
