"use client";

// One seat on an interview panel: the panellist, their scorecard state, the AI
// panellist trigger, and the disagreement tag. Split out of InterviewRounds.tsx.

import { useState } from "react";
import { formatDate } from "@/kernel/ui/format";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { RECOMMENDATIONS } from "@/entities/hiring/lib/interview-panel";
import {
  removePanelist,
  runAiPanelist,
  type InterviewRound,
  type PanelSeat,
} from "./interview-actions";
import { disagrees, humanScores, recTone } from "./interview-scoring";

import { ScorecardForm } from "./InterviewScorecard";

export function PanelSeatRow({
  round,
  seat,
  humansAllIn,
  humanScorecards,
  hasTranscript,
  onChange,
}: {
  round: InterviewRound;
  seat: PanelSeat;
  humansAllIn: boolean;
  humanScorecards: NonNullable<PanelSeat["scorecard"]>[];
  hasTranscript: boolean;
  onChange: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const sc = seat.scorecard;
  const rec = sc?.recommendation ? RECOMMENDATIONS.find((r) => r.key === sc.recommendation) : null;

  // Blind-first: an AI scorecard is hidden until every human on the round is in.
  const aiBlind = seat.isAi && Boolean(sc) && !humansAllIn;
  const showScorecard = Boolean(sc) && !editing && !aiBlind;

  async function runAi() {
    setAiBusy(true);
    setAiErr(null);
    const r = await runAiPanelist(round.id);
    setAiBusy(false);
    if (!r.ok) return setAiErr(r.error);
    await onChange();
  }

  return (
    <div className="u-p-2 admin-box">
      <div className="u-row u-wrap">
        <span
          aria-hidden
          className={`admin-tag-xs${seat.isAi ? " admin-tag-xs--accent" : ""}`}
        >
          {seat.isAi ? "AI" : seat.role === "lead" ? "LEAD" : seat.role.toUpperCase()}
        </span>
        <span className="admin-cell-strong">{seat.name}</span>
        {rec && !aiBlind && (
          <span className="u-sm u-strong" style={{ color: recTone(rec.tone) }} /* layout-ok: tone is a token var chosen at runtime */>
            {rec.label}
            {sc?.overallScore != null ? ` · ${sc.overallScore}/5` : ""}
          </span>
        )}
        {aiBlind && (
          <span className="admin-cell-muted u-sm">
            scored · hidden
          </span>
        )}
        <span className="u-row u-ml-auto">
          {seat.isAi ? (
            <button
              type="button"
              className="admin-btn admin-btn--sm"
              disabled={aiBusy || !hasTranscript}
              title={hasTranscript ? undefined : "Add a transcript first"}
              onClick={runAi}
            >
              {aiBusy ? "Scoring…" : sc ? "Re-run" : "Run AI panelist"}
            </button>
          ) : (
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => setEditing((v) => !v)}>
              {editing ? "Close" : sc ? "Edit scorecard" : "Submit scorecard"}
            </button>
          )}
          {!seat.isAi && !sc && seat.role !== "lead" && (
            <ConfirmButton
              label="Remove"
              className="admin-btn admin-btn--sm"
              title={`Remove ${seat.name} from this panel?`}
              body="They lose their seat on this round. You can add them back later."
              confirmLabel="Remove"
              onConfirm={() => removePanelist(round.id, seat.interviewerId)}
              onDone={() => void onChange()}
            />
          )}
        </span>
      </div>

      {aiErr && (
        <div className="admin-alert admin-alert--err u-mt-2">
          {aiErr}
        </div>
      )}

      {seat.isAi && !sc && !aiErr && (
        <div className="admin-hint u-mt-1">
          {hasTranscript
            ? "The AI panelist scores automatically when a transcript is added. Run it now if needed."
            : "Add a transcript for this round and the AI panelist scores it automatically."}
        </div>
      )}

      {aiBlind && (
        <div className="admin-hint u-mt-1">
          The AI has scored this round. It stays hidden until every interviewer submits, so it can’t sway the panel.
        </div>
      )}

      {showScorecard && sc && (
        <div className="u-stack u-mt-2">
          {sc.scores.length > 0 && (
            <div className="u-stack">
              {sc.scores.map((s) => {
                const flag = seat.isAi && humansAllIn && disagrees(s.score, humanScores(humanScorecards, s.criterion));
                return (
                  <div key={s.criterion} className="u-row">
                    <span className="admin-cell-muted u-min-1">
                      {s.criterion}
                    </span>
                    <span className="admin-cell-strong">{s.score != null ? `${s.score}/5` : "—"}</span>
                    {flag && <DisagreeTag />}
                    {s.comment && <span className="admin-cell-muted">{s.comment}</span>}
                  </div>
                );
              })}
            </div>
          )}
          {seat.isAi && humansAllIn && disagrees(sc.overallScore, humanScorecards.map((h) => h.overallScore)) && (
            <div className="u-sm">
              <DisagreeTag /> <span className="admin-cell-muted">overall differs from a human panelist by a full point</span>
            </div>
          )}
          {sc.summary && <div className="u-prewrap">{sc.summary}</div>}
          {sc.submittedAt && (
            <div className="admin-cell-muted">
              {seat.isAi ? "Scored" : "Submitted"} {formatDate(sc.submittedAt)}
            </div>
          )}
        </div>
      )}

      {editing && !seat.isAi && (
        <ScorecardForm
          round={round}
          seat={seat}
          onDone={async () => {
            setEditing(false);
            await onChange();
          }}
        />
      )}
    </div>
  );
}

function DisagreeTag() {
  return (
    <span
      className="admin-tag-xs admin-tag-xs--warn"
    >
      GAP
    </span>
  );
}
