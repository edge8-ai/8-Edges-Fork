"use client";

import Link from "next/link";
import { humanize } from "@/kernel/ui/format";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { EditableText, type InlineSaveResult } from "@/kernel/ui/InlineEdit";
import { type StageOption } from "../actions";
import { RejectControl } from "./RejectControl";
import { OverflowMenu } from "./OverflowMenu";
import { HeaderStars } from "./HeaderStars";

export function DecisionHeader(props: {
  name: string;
  jobReqTitle: string | null;
  source: string | null;
  stageName: string | null;
  status: string;
  rating: number | null;
  onRate: (v: number | null) => void;
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
}) {
  return (
    <div className="admin-record-head">
      <div className="admin-record-head-crumb">
        <Link href="/admin/talent/applications">← Applications</Link>
      </div>
      <div className="admin-record-head-row">
        <div className="admin-record-head-id">
          <h1 className="admin-record-head-title">
            <span>{props.name}</span>
            {(() => {
              // Stage and status are different axes, but on a terminal stage they
              // read the same word (both "Rejected"/"Hired"). Show one badge then,
              // toned by the status; otherwise show the stage and, if not active,
              // the status.
              const statusLabel = humanize(props.status);
              const showStatus = props.status !== "active";
              const dup = props.stageName != null && showStatus && props.stageName.toLowerCase() === statusLabel.toLowerCase();
              return (
                <>
                  {props.stageName && !dup && <Badge tone="info">{props.stageName}</Badge>}
                  {showStatus && <Badge tone={statusTone(props.status)}>{statusLabel}</Badge>}
                </>
              );
            })()}
            <HeaderStars value={props.rating} onChange={props.onRate} />
          </h1>
          <div className="admin-record-head-meta">
            {props.jobReqTitle ? <strong>{props.jobReqTitle}</strong> : "No job req"}
            {props.source ? ` · ${humanize(props.source)}` : ""}
          </div>
          {props.status === "rejected" && (
            <div className="admin-record-head-meta u-mt-1">
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
        <div className="admin-record-head-actions">
          <button
            type="button"
            className="admin-btn admin-btn--primary admin-btn--sm"
            disabled={props.advanceDisabled}
            onClick={props.onAdvance}
            title={props.nextStage ? `Move to ${props.nextStage.name}` : "No next stage"}
          >
            {props.nextStage ? `Advance to ${props.nextStage.name}` : "Advance"}
          </button>
          {props.proposeDecision ? (
            <a href="#decision" className="admin-btn admin-btn--sm">
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
    </div>
  );
}
