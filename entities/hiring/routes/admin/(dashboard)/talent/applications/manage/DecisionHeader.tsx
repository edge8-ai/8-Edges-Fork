"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { formatDate, humanize } from "@/kernel/ui/format";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { EditableText, type InlineSaveResult } from "@/kernel/ui/InlineEdit";
import { type StageOption } from "../actions";
import { RejectControl } from "./RejectControl";
import { OverflowMenu } from "./OverflowMenu";

export function DecisionHeader(props: {
  name: string;
  jobReqId: string | null;
  jobReqTitle: string | null;
  source: string | null;
  stageName: string | null;
  status: string;
  /** HR's own rating; it is set in the HR assessment card, and only shown here. */
  rating: number | null;
  aiRating: number | null;
  appliedAt: string | null;
  onStatus: (v: string) => void;
  onReject: (reason: string) => Promise<boolean>;
  rejectionReason: string;
  onRejectionReason: (v: string) => Promise<InlineSaveResult>;
  nextStage: StageOption | null;
  advanceDisabled: boolean;
  onAdvance: () => void;
  archived: boolean;
  onToggleArchive: () => void;
  error: string | null;
  /** In a live hiring chain (Z.9): Hired and Rejected are proposed in the Decision card, not set here. */
  proposeDecision?: boolean;
  /** The pipeline strip, drawn inside the band under the facts. */
  children?: ReactNode;
}) {
  // Stage and status are different axes, but on a terminal stage they read the
  // same word (both "Rejected"/"Hired"). Show one badge then, toned by the
  // status; otherwise show the stage and, if not active, the status.
  const statusLabel = humanize(props.status);
  const showStatus = props.status !== "active";
  const dup = props.stageName != null && showStatus && props.stageName.toLowerCase() === statusLabel.toLowerCase();
  return (
    <div className="ats-hero">
      <div className="ats-hero-top">
        <div>
          <p className="ats-k">
            {/* The way back is the hierarchy: the reqs, then the req this application is under. */}
            <Link href="/admin/talent/jobs">Job reqs</Link>
            {" · "}
            {props.jobReqId ? <Link href={`/admin/talent/jobs/${props.jobReqId}`}>{props.jobReqTitle || "Untitled req"}</Link> : "No job req"}
          </p>
          <h1 className="ats-h">{props.name}</h1>
          <ul className="ats-chips">
            {props.stageName && !dup && <li><Badge tone="info">{props.stageName}</Badge></li>}
            {showStatus && <li><Badge tone={statusTone(props.status)}>{statusLabel}</Badge></li>}
            {props.appliedAt && <li className="ats-chip">Applied {formatDate(props.appliedAt)}</li>}
            {props.source && <li className="ats-chip">{humanize(props.source)}</li>}
            {props.aiRating != null && <li className="ats-chip">AI screen {props.aiRating.toFixed(1)} of 5</li>}
            <li className={`ats-chip${props.rating == null ? " ats-chip--calm" : ""}`}>
              {props.rating != null ? `HR rating ${props.rating} of 5` : "Not rated by HR"}
            </li>
          </ul>
          {props.status === "rejected" && (
            <div className="ats-sub">
              Reason:{" "}
              <EditableText
                value={props.rejectionReason}
                onSave={props.onRejectionReason}
                placeholder="Add a reason…"
                ariaLabel="Rejection reason"
              />
            </div>
          )}
        </div>
        <div className="ats-hero-actions">
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            disabled={props.advanceDisabled}
            onClick={props.onAdvance}
            title={props.nextStage ? `Move to ${props.nextStage.name}` : "No next stage"}
          >
            {props.nextStage ? `Advance to ${props.nextStage.name}` : "Advance"}
          </button>
          {props.proposeDecision ? (
            <a href="#decision" className="admin-btn">
              Propose decision
            </a>
          ) : (
            <RejectControl onReject={props.onReject} disabled={props.status === "rejected"} />
          )}
          <OverflowMenu
            status={props.status}
            onStatus={props.onStatus}
            proposeDecision={props.proposeDecision}
            archived={props.archived}
            onToggleArchive={props.onToggleArchive}
          />
        </div>
      </div>
      {props.error && (
        <div className="admin-alert admin-alert--err u-mt-3">
          {props.error}
        </div>
      )}
      {props.children}
    </div>
  );
}
