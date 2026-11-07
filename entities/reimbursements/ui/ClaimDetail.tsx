// One claim, as every viewer sees it (design §1.5): the way back, the title
// with its status and total, what the viewer reads first, the receipts, the
// cards for whatever this viewer may do, and the claim's history. The owner's
// page and the checker's render it today; the approver's, the payer's and the
// admin's render it as their tickets arrive. The page decides the props from
// what the viewer may do (`access.may(...)`, the own-claim rule, the claim's
// status), so this component holds no rule of its own: it never decides who
// sees a move, it only lays out the ones it is handed.
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { CLAIM_STATUS_LABEL, CLAIM_STATUS_TONE } from "../lib/claim-rules";
import { describeClaimEvent, historyMilestones } from "../lib/claim-labels";
import { tripLabel } from "../lib/trip-rules";
import type { MyClaim, MyEvent, MyItem } from "../lib/my-claims";
import { ClaimTotal } from "./ItemValue";

export type ClaimDetailProps = {
  claim: MyClaim;
  /** The list this page was opened from. */
  back: { href: string; label: string };
  /** The claimant's name, above the title for everyone but the claimant. */
  ownerName?: string;
  /** The figure beside the status: every receipt for the owner, the kept total for a decider. */
  totalVnd: number;
  /** Kept receipts the total leaves out because their rate is pending (RB.10); the header says so beside it. */
  ratePending?: number;
  /** What the viewer reads first under the title: the status line, the own-claim note. */
  notices?: ReactNode;
  /** The receipts card's body: editable for the owner, each document beside its line for a decider. */
  receipts: ReactNode;
  /** The cards above the history, one per thing this viewer may do; nothing when they may do nothing. */
  actions?: ReactNode;
  /** The owner's trip picker while the claim is theirs to change; everyone else reads the trip's name. */
  tripEditor?: ReactNode;
};

export function ClaimDetail({ claim, back, ownerName, totalVnd, ratePending, notices, receipts, actions, tripEditor }: ClaimDetailProps) {
  return (
    <>
      <p className="u-mb-3">
        <Link href={back.href}>← {back.label}</Link>
      </p>
      <PageHead
        eyebrow={ownerName}
        title={claim.title}
        sub={`${claim.receipts} receipt${claim.receipts === 1 ? "" : "s"}${claim.submittedAt ? ` · submitted ${formatDate(claim.submittedAt)}` : ""}`}
        action={
          <span className="u-row u-gap-1 u-items-center">
            <Badge tone={CLAIM_STATUS_TONE[claim.status]}>{CLAIM_STATUS_LABEL[claim.status]}</Badge>
            <ClaimTotal totalVnd={totalVnd} ratePending={ratePending} large />
          </span>
        }
      />
      {notices}
      <div className="u-grid-2-1 u-mt-4">
        <section className="admin-card admin-section-card">
          <h2 className="admin-card-title">Receipts</h2>
          {receipts}
        </section>
        <div className="u-stack u-gap-4">
          <ClaimTripAndRebill claim={claim} tripEditor={tripEditor} />
          {actions}
          <section className="admin-card admin-section-card">
            <h2 className="admin-card-title">History</h2>
            <ClaimHistory events={claim.events} />
          </section>
        </div>
      </div>
    </>
  );
}

/**
 * The claim's trip and what is to be rebilled, by client (RB.11): the facts
 * the month-end export and a trip's cost read, shown to every viewer. Declined
 * receipts are left out of the rebill, as they are out of the total.
 */
export function ClaimTripAndRebill({ claim, tripEditor }: { claim: MyClaim; tripEditor?: ReactNode }) {
  const rebills = rebillByClient(claim.items);
  return (
    <section className="admin-card admin-section-card">
      <h2 className="admin-card-title">Event</h2>
      {tripEditor ?? <div className={claim.trip ? "" : "admin-cell-muted"}>{claim.trip ? tripLabel(claim.trip) : "No event"}</div>}
      {rebills.length > 0 && (
        <>
          <h3 className="admin-label u-mt-4">Rebill</h3>
          <div className="admin-list">
            {rebills.map((r) => (
              <div key={r.id} className="admin-list-row">
                <div className="admin-list-main">
                  <div className="admin-list-title">{r.name}</div>
                  <div className="admin-list-sub">
                    {r.receipts} receipt{r.receipts === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="admin-list-aside">
                  <ClaimTotal totalVnd={r.vnd} ratePending={r.ratePending} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

type RebillRow = { id: string; name: string; receipts: number; vnd: number; ratePending: number };

/**
 * What is to be rebilled, by client; a receipt whose rate is pending is
 * counted, not summed as 0 (RB.10). A declined receipt, or one its owner
 * removed (20261008090000), is rebilled to nobody.
 */
function rebillByClient(items: MyItem[]): RebillRow[] {
  const out = new Map<string, RebillRow>();
  for (const i of items) {
    if (!i.rebill || i.declined || i.removed) continue;
    const id = i.rebillCompany?.id ?? "";
    const row = out.get(id) ?? { id, name: i.rebillCompany?.name ?? "A client", receipts: 0, vnd: 0, ratePending: 0 };
    row.receipts += 1;
    if (i.amountVnd === null) row.ratePending += 1;
    else row.vnd += i.amountVnd;
    out.set(id, row);
  }
  return [...out.values()];
}

/** One card in the column beside the receipts. */
export function ClaimCard({ children }: { children: ReactNode }) {
  return <section className="admin-card admin-section-card">{children}</section>;
}

export function ClaimHistory({ events }: { events: MyEvent[] }) {
  // Only the milestones (RB.19); every move is still in the events table.
  const shown = historyMilestones(events);
  if (shown.length === 0) return <div className="admin-empty">Not submitted yet.</div>;
  return (
    <div className="admin-list">
      {shown.map((e) => (
        <div key={e.id} className="admin-list-row">
          <div className="admin-list-main">
            <div className="admin-list-title">
              {describeClaimEvent(e)}
              {e.actorName && <span className="admin-cell-muted"> · {e.actorName}</span>}
            </div>
            {e.reason && <div className="admin-list-sub">{e.reason}</div>}
          </div>
          <div className="admin-list-aside">
            <span className="admin-list-sub">{formatDate(e.at)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
