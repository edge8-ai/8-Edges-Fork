"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Recommendations } from "@/entities/hiring";
import type { RecommendationKey } from "@/entities/hiring";
import type { KitScorecard } from "@/entities/team/lib/interview-kit";
import { submitMyScorecard } from "./kit-actions";

const SCORE_OPTIONS = [1, 2, 3, 4, 5];

type Row = { criterion: string; score: number | null; comment: string };

// The panelist's own scorecard form. Prefills from a prior save; submitting is
// blind-first (the server withholds the other seats until this one lands, then
// router.refresh reloads the kit and reveals them).
export function ScorecardForm({
  interviewId,
  criteria,
  initial,
  submitted,
  recommendations,
}: {
  interviewId: string;
  criteria: string[];
  initial: KitScorecard | null;
  submitted: boolean;
  // company-os's RECOMMENDATIONS, passed by the page because this is a client
  // component and the company-os door is a server-only barrel (ME-11).
  recommendations: Recommendations;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const initialByCriterion = new Map((initial?.scores ?? []).map((s) => [s.criterion, s]));
  const [recommendation, setRecommendation] = useState<RecommendationKey | "">(initial?.recommendation ?? "");
  const [overall, setOverall] = useState<number | "">(initial?.overallScore ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [rows, setRows] = useState<Row[]>(
    criteria.map((c) => {
      const prev = initialByCriterion.get(c);
      return { criterion: c, score: prev?.score ?? null, comment: prev?.comment ?? "" };
    }),
  );

  function setRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function submit() {
    setError(null);
    setDone(false);
    startTransition(async () => {
      const res = await submitMyScorecard(interviewId, {
        recommendation: recommendation || null,
        overallScore: overall === "" ? null : overall,
        summary,
        scores: rows.map((r) => ({ criterion: r.criterion, score: r.score, comment: r.comment })),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(true);
      router.refresh();
    });
  }

  return (
    <div className="admin-form">
      <div className="u-row u-wrap">
        <div className="admin-field u-flex-200">
          <label className="admin-label">Recommendation</label>
          <select
            className="admin-select"
            value={recommendation}
            onChange={(e) => setRecommendation(e.target.value as RecommendationKey | "")}
          >
            <option value="">Choose one</option>
            {recommendations.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="admin-field u-flex-fixed-sm">
          <label className="admin-label">Overall score</label>
          <select
            className="admin-select"
            value={overall}
            onChange={(e) => setOverall(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">Not scored</option>
            {SCORE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="admin-label u-block u-mb-2">
          Rubric
        </label>
        <div className="admin-hire-criteria">
          {rows.map((row, i) => (
            <div key={row.criterion} className="admin-hire-criterion">
              <span className="admin-hire-criterion-label">{row.criterion}</span>
              <select
                className="admin-select admin-hire-criterion-score"
                value={row.score ?? ""}
                onChange={(e) => setRow(i, { score: e.target.value === "" ? null : Number(e.target.value) })}
              >
                <option value="">-</option>
                {SCORE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <input
                className="admin-input admin-hire-criterion-note"
                placeholder="Evidence from the interview"
                value={row.comment}
                onChange={(e) => setRow(i, { comment: e.target.value })}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="admin-field">
        <label className="admin-label">Summary</label>
        <textarea
          className="admin-textarea"
          placeholder="Your read on this candidate for this round."
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
      </div>

      {error && <div className="admin-hint u-err">{error}</div>}
      {done && !error && (
        <div className="admin-hint u-ok">
          Scorecard saved. The rest of the panel is now visible below.
        </div>
      )}

      <div className="admin-form-actions">
        <button type="button" className="admin-btn admin-btn--primary" disabled={pending} onClick={submit}>
          {pending ? "Saving…" : submitted ? "Update my scorecard" : "Submit my scorecard"}
        </button>
      </div>
    </div>
  );
}
