"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/kernel/ui/Badge";
import { useChainAction } from "@/entities/hiring/ui/useChainAction";
import { approveHiringShortlist, moveShortlistLane, rejectHiringShortlist } from "@/entities/hiring/lib/chain/approve-actions";
import type { RequisitionChainView, ShortlistCandidate } from "@/entities/hiring/lib/chain/view";
import type { MayProp } from "@/kernel/identity/may-prop";

// The shortlist review (Z.9, ShortlistAfter): the lanes the chain proposed
// from the AI screen, each candidate's rating, overview and flags, moves
// between lanes, and one approval for the version shown. Nothing leaves on
// this approval; each invitation and decline it leads to is its own.

type Lane = ShortlistCandidate["lane"];

const LANES: { lane: Lane; label: string; what: string }[] = [
  { lane: "advance", label: "Advance", what: "An invitation to the first interview is drafted for each." },
  { lane: "hold", label: "Hold", what: "Stays at triage for the next round. Every flagged or unscreened application starts here." },
  { lane: "decline", label: "Decline", what: "A decline is drafted for each; the rejection is written when its message is approved." },
];

const KIND_WORD = { invite: "Interview invitation", decline: "Decline", decision_hire: "Hire message", decision_reject: "Rejection message" } as const;

export function ShortlistReview({ shortlist, may }: { shortlist: NonNullable<RequisitionChainView["shortlist"]>; may: MayProp }) {
  const canApprove = may["hiring.approve"] === true;
  const { pending, note, run } = useChainAction();
  const [reason, setReason] = useState("");
  const proposed = shortlist.status === "proposed";
  const changed = proposed && shortlist.asked !== null && shortlist.asked !== shortlist.version;
  const count = (lane: Lane) => shortlist.candidates.filter((c) => c.lane === lane).length;

  // A link to #shortlist (the approvals inbox) lands here once the page has streamed in.
  useEffect(() => {
    if (window.location.hash === "#shortlist") document.getElementById("shortlist")?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <section id="shortlist" className="admin-card admin-section-card u-mb-5" aria-label="Shortlist approval">
      <div className="u-row u-between u-wrap u-gap-3 u-mb-3">
        <div className="u-stack u-gap-1 u-min-0">
          <div className="admin-approval-eyebrow">
            <span className="admin-approval-subject">Hiring · Shortlist · round {shortlist.round}</span>
            <Badge>Internal</Badge>
            <Badge tone={proposed ? "warn" : shortlist.status === "rejected" ? "err" : "ok"}>{proposed ? "Waits on approval" : shortlist.status}</Badge>
          </div>
          <h2 className="admin-approval-title u-m-0">
            {count("advance")} to advance, {count("decline")} to decline, {count("hold")} held
          </h2>
          <p className="admin-approval-meta u-m-0">
            Proposed by the hiring chain from the AI screen: advance at 3.5 or above with no flag, hold anything flagged or unscreened, decline the rest.
          </p>
        </div>
        <dl className="admin-approval-facts">
          <div className="admin-approval-fact"><dt>Version shown</dt><dd>{shortlist.version}</dd></div>
          <div className="admin-approval-fact"><dt>Waits on</dt><dd>Hiring approver</dd></div>
        </dl>
      </div>

      {changed && (
        <div className="admin-alert admin-alert--warn u-mb-3" role="status">
          The lanes changed since approval was asked for. Approving now asks again for version {shortlist.version}; read the lanes again, then approve.
        </div>
      )}

      <div className="u-grid-3">
        {LANES.map(({ lane, label, what }) => (
          <div key={lane} className="admin-card admin-card--outlined admin-campaign-lane">
            <div className="admin-campaign-lane-head">
              <h3 className="admin-card-title admin-card-title--compact u-m-0">{label}</h3>
              <Badge>{count(lane)}</Badge>
            </div>
            <p className="admin-hint u-m-0 u-mb-3">{what}</p>
            <div className="u-stack u-gap-2">
              {shortlist.candidates.filter((c) => c.lane === lane).map((c) => (
                <article key={c.applicationId} className="admin-card u-p-3 u-stack u-gap-1">
                  <div className="u-row u-between u-gap-2">
                    <Link href={`/admin/talent/applications/${c.applicationId}`} className="u-strong u-truncate">{c.name}</Link>
                    <span className="u-sm u-tabular">{c.rating === null ? "No screen" : c.rating.toFixed(1)}</span>
                  </div>
                  {c.overview && <p className="u-sm u-muted u-m-0 u-clamp-4">{c.overview}</p>}
                  {c.flags.length > 0 && (
                    <div className="admin-alert admin-alert--warn u-sm">Hold: {c.flags[0].kind.replace(/-/g, " ")}{c.flags[0].quote ? ` (“${c.flags[0].quote}”)` : ""}. A person reads this résumé.</div>
                  )}
                  {proposed && canApprove && (
                    <div className="u-row u-wrap u-gap-1">
                      {LANES.filter((l) => l.lane !== lane).map((l) => (
                        <button key={l.lane} type="button" className="admin-btn admin-btn--ghost admin-btn--sm" disabled={pending} onClick={() => run(() => moveShortlistLane(shortlist.id, c.applicationId, l.lane), `Moved to ${l.label}. The approval was asked again.`)}>
                          Move to {l.label}
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>

      {proposed && canApprove && (
        <div className="admin-approval-actions u-mt-4">
          <button type="button" className="admin-btn admin-btn--primary" disabled={pending} onClick={() => run(() => approveHiringShortlist(shortlist.id, shortlist.version), "Approved. The invitations and declines are being drafted.")}>
            Approve shortlist
          </button>
          <input className="admin-input u-flex-1" aria-label="Reason, if you reject" placeholder="Reason, if you reject" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          <button type="button" className="admin-btn" disabled={pending} onClick={() => run(() => rejectHiringShortlist(shortlist.id, reason.trim() || null), "Rejected.")}>
            Reject
          </button>
        </div>
      )}
      {proposed && !canApprove && <p className="admin-hint u-mt-3 u-m-0">Waits on a holder of Hiring approver.</p>}

      {shortlist.status === "applied" && (
        <div className="admin-alert admin-alert--ok u-mt-4 u-stack u-gap-2">
          <div>Applied. Each invitation and decline waits on its own approval.</div>
          {shortlist.drafted.map((d) => (
            <div key={d.applicationId} className="u-row u-between u-wrap u-gap-2">
              <span><strong>{d.name}</strong> · {KIND_WORD[d.kind]}</span>
              <span className="u-row u-gap-2">
                <Badge tone="info">Tier 1 · one candidate</Badge>
                <span className="u-sm">{d.status}</span>
                <Link href={`/admin/talent/applications/${d.applicationId}`} className="u-sm">Read the message</Link>
              </span>
            </div>
          ))}
          <div className="u-sm">Held candidates stay at triage for the next round. Nothing was sent by this approval.</div>
        </div>
      )}
      {shortlist.status === "rejected" && (
        <div className="admin-alert admin-alert--warn u-mt-4">
          Rejected{shortlist.decision?.reason ? `: ${shortlist.decision.reason}` : ""}. Every application stays at triage and nothing moved. Press Propose shortlist to ask again.
        </div>
      )}

      {note && <div className={`admin-alert admin-alert--${note.tone === "ok" ? "ok" : "err"} u-mt-3`} role="status">{note.text}</div>}
    </section>
  );
}
