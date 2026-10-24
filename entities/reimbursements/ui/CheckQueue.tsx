// A list of claims (RB.14): who claimed what, how many receipts, how long it
// has waited at its stage, what the AI reading flagged, and its total — what a
// check would pass on, or the frozen total once approved. A total that leaves
// out a receipt whose rate is pending says so (RB.10), so no list shows a part
// of a claim as the whole of it. Every tab of Reimbursements in Admin and the
// Team view's To check render it, so everyone who works with claims reads the
// same list. Each row opens the claim under `hrefBase`, the surface the list
// is on, so a checker or approver who works in Admin stays there.
import Link from "next/link";
import { Badge } from "@/kernel/ui/Badge";
import type { ClaimToCheck } from "../lib/check-queue";
import { waitingFor } from "../lib/claim-labels";
import { NO_PERSON_RECORD } from "../lib/deciders";
import { CLAIM_STATUS_LABEL, CLAIM_STATUS_TONE, type ClaimStatus } from "../lib/claim-rules";
import { ClaimTotal } from "./ItemValue";

/** What every decider page shows, instead of reading anything, to a viewer with no person record. */
export function CheckerWithoutPerson() {
  return (
    <p className="admin-alert admin-alert--err" role="alert">
      {NO_PERSON_RECORD}
    </p>
  );
}

/** Two letters for a claimant's avatar: their first and last names' first letters. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")).toUpperCase();
}

export function CheckQueue({
  claims,
  hrefBase,
  empty = "Nothing is waiting to be checked.",
  waitingLabel = "Waiting",
}: {
  /** A list that mixes statuses carries each claim's, and shows it. */
  claims: (ClaimToCheck & { status?: ClaimStatus })[];
  /** The claim pages this list opens: `${hrefBase}/${id}`. */
  hrefBase: string;
  empty?: string;
  /** The heading over how long each claim has waited: "Waiting", or "Approved" on the list of approved claims. */
  waitingLabel?: string;
}) {
  if (claims.length === 0) return <div className="admin-empty">{empty}</div>;
  return (
    <div className="admin-rbq" role="table" aria-label="Claims">
      <div className="admin-rbq-head" role="row">
        <span role="columnheader">Claim</span>
        <span role="columnheader">Receipts</span>
        <span role="columnheader">{waitingLabel}</span>
        <span role="columnheader">To look at</span>
        <span role="columnheader" className="u-right">
          Total
        </span>
      </div>
      {claims.map((c) => {
        const waited = waitingFor(c.stageAt);
        return (
          <div key={c.id} className="admin-rbq-row" role="row">
            <span className="admin-rbq-claim" role="cell">
              <span className="admin-rbq-avatar" aria-hidden="true">
                {initialsOf(c.ownerName)}
              </span>
              <span className="admin-rbq-who">
                <Link href={`${hrefBase}/${c.id}`} className="admin-rbq-title">
                  {c.title}
                </Link>
                <span className="admin-list-sub">
                  {c.ownerName}
                  {c.status && (
                    <>
                      {" · "}
                      <Badge tone={CLAIM_STATUS_TONE[c.status]}>{CLAIM_STATUS_LABEL[c.status]}</Badge>
                    </>
                  )}
                </span>
              </span>
            </span>
            <span role="cell" className="admin-rbq-cell">
              {c.receipts} receipt{c.receipts === 1 ? "" : "s"}
              {c.declined > 0 ? ` (${c.declined} declined)` : ""}
            </span>
            <span role="cell" className="admin-rbq-cell">
              {waited ? <Badge tone={waited.stale ? "warn" : "neutral"}>{waited.label}</Badge> : "—"}
            </span>
            <span role="cell" className="admin-rbq-cell">
              {c.flagged > 0 ? (
                <Badge tone="warn">
                  {c.flagged} receipt{c.flagged === 1 ? "" : "s"} flagged
                </Badge>
              ) : (
                <Badge tone="ok">Nothing flagged</Badge>
              )}
            </span>
            <span role="cell" className="admin-rbq-total">
              <ClaimTotal totalVnd={c.totalVnd} ratePending={c.ratePending} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
