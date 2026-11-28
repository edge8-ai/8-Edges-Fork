"use client";

// The scorecard one panellist fills in for one round: a score and comment per
// criterion, an overall score and a recommendation. Split out of
// InterviewRounds.tsx.

import { useReducer, useState } from "react";
import { RECOMMENDATIONS, DEFAULT_CRITERIA, type RecommendationKey } from "@/entities/hiring/lib/interview-panel";
import {
  submitScorecard,
  type InterviewRound,
  type PanelSeat,
} from "./interview-actions";
import { recTone } from "./interview-scoring";

// `added` marks a criterion the panellist added in this form: only that one has
// an editable name. The rubric's own criteria are labels.
type ScoreRow = { criterion: string; score: number | null; comment: string; added?: boolean };

// The scorecard draft. These four are submitted as one object and discarded as
// one, so they are one reducer rather than four useState calls; `busy` and
// `err` stay separate because submission status is not part of the draft.
type ScorecardDraft = {
  recommendation: RecommendationKey | null;
  overall: number | null;
  summary: string;
  rows: ScoreRow[];
};
const mergeScorecardDraft = (state: ScorecardDraft, p: Partial<ScorecardDraft>): ScorecardDraft => ({
  ...state,
  ...p,
});

export function ScorecardForm({
  round,
  seat,
  onDone,
}: {
  round: InterviewRound;
  seat: PanelSeat;
  onDone: () => Promise<void>;
}) {
  const existing = seat.scorecard;
  const initialDraft: ScorecardDraft = {
    recommendation: existing?.recommendation ?? null,
    overall: existing?.overallScore ?? null,
    summary: existing?.summary ?? "",
    rows:
      existing && existing.scores.length > 0
        ? existing.scores.map((s) => ({ criterion: s.criterion, score: s.score, comment: s.comment ?? "" }))
        : DEFAULT_CRITERIA.map((c) => ({ criterion: c, score: null, comment: "" })),
  };
  const [draft, patch] = useReducer(mergeScorecardDraft, initialDraft);
  const { recommendation, overall, summary, rows } = draft;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function setRow(i: number, rowPatch: Partial<ScoreRow>) {
    patch({ rows: rows.map((r, j) => (j === i ? { ...r, ...rowPatch } : r)) });
  }

  async function save() {
    setBusy(true);
    setErr(null);
    const r = await submitScorecard(round.id, seat.interviewerId, {
      recommendation,
      overallScore: overall,
      summary,
      scores: rows.map(({ criterion, score, comment }) => ({ criterion, score, comment })),
    });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    await onDone();
  }

  return (
    <div className="admin-form u-mt-3">
      <div className="admin-field">
        <label className="admin-label">Recommendation</label>
        <div className="u-row">
          {RECOMMENDATIONS.map((r) => {
            const on = recommendation === r.key;
            return (
              <button
                key={r.key}
                type="button"
                className="admin-btn admin-btn--sm"
                aria-pressed={on}
                onClick={() => patch({ recommendation: on ? null : r.key })}
                style={
                  on
                    ? { borderColor: recTone(r.tone), color: recTone(r.tone), fontWeight: 600 }
                    : undefined
                }
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="admin-field">
        <label className="admin-label">Overall score</label>
        <ScoreButtons value={overall} onChange={(v) => patch({ overall: v })} />
      </div>

      <div className="admin-field">
        <label className="admin-label">Criteria</label>
        <div className="u-stack">
          {rows.map((row, i) => (
            <div key={i} className="u-stack u-gap-1">
              <div className="u-row u-wrap">
                {row.added ? (
                  <input
                    className="admin-input u-flex-1 u-max-3"
                    value={row.criterion}
                    placeholder="Criterion"
                    aria-label="Criterion name"
                    onChange={(e) => setRow(i, { criterion: e.target.value })}
                  />
                ) : (
                  <span className="u-flex-1 u-max-3">{row.criterion}</span>
                )}
                <ScoreButtons value={row.score} onChange={(v) => setRow(i, { score: v })} />
              </div>
              <input
                className="admin-input"
                value={row.comment}
                placeholder="Evidence / comment (optional)"
                aria-label={`${row.criterion || "Criterion"} evidence`}
                onChange={(e) => setRow(i, { comment: e.target.value })}
              />
            </div>
          ))}
          <button
            type="button"
            className="admin-btn admin-btn--sm u-self-start"
            onClick={() => patch({ rows: [...rows, { criterion: "", score: null, comment: "", added: true }] })}
          >
            + Add criterion
          </button>
        </div>
      </div>

      <div className="admin-field">
        <label className="admin-label">Summary</label>
        <textarea
          className="admin-input"
          rows={3}
          placeholder="Overall read on the candidate from this round…"
          value={summary}
          onChange={(e) => patch({ summary: e.target.value })}
        />
      </div>

      {err && <div className="admin-alert admin-alert--err">{err}</div>}

      <div className="admin-form-actions">
        <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Submit scorecard"}
        </button>
      </div>
    </div>
  );
}

function ScoreButtons({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="u-row">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = value === n;
        return (
          <button
            key={n}
            type="button"
            aria-label={`Score ${n}`}
            aria-pressed={on}
            onClick={() => onChange(on ? null : n)}
            className={`admin-score-btn${on ? " is-on" : ""}`}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}
