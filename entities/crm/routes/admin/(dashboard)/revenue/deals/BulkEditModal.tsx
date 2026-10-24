"use client";

import { useState } from "react";
import type { StageOption } from "./types";

type BulkPatch = {
  stage_id?: string;
  probability?: number | null;
  expected_close_date?: string | null;
  source?: string | null;
};

export function BulkEditModal({
  count,
  stageOptions,
  onApply,
  onCancel,
}: {
  count: number;
  stageOptions: StageOption[];
  onApply: (patch: BulkPatch) => Promise<{ ok: true } | { ok: false; error: string }>;
  onCancel: () => void;
}) {
  const [stage, setStage] = useState("");
  const [probability, setProbability] = useState("");
  const [expectedClose, setExpectedClose] = useState("");
  const [source, setSource] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    const patch: BulkPatch = {};
    if (stage) patch.stage_id = stage;
    if (probability.trim() !== "") patch.probability = Number(probability);
    if (expectedClose) patch.expected_close_date = expectedClose;
    if (source.trim() !== "") patch.source = source.trim();
    if (Object.keys(patch).length === 0) {
      setError("Fill at least one field to apply.");
      return;
    }
    setPending(true);
    setError(null);
    const r = await onApply(patch);
    setPending(false);
    if (!r.ok) setError(r.error);
  }

  return (
    <div className="admin-modal-backdrop" onClick={() => !pending && onCancel()}>
      <div className="admin-modal" role="dialog" aria-modal="true" aria-label="Bulk edit deals" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-title">Edit {count} deal{count === 1 ? "" : "s"}</div>
        <div className="admin-modal-body">Only the fields you fill are changed. Leave a field blank to keep it as-is.</div>

        <div className="admin-form u-mt-4">
          <div className="admin-field">
            <label className="admin-label">Move to stage</label>
            <select className="admin-select" value={stage} onChange={(e) => setStage(e.target.value)}>
              <option value="">Keep current</option>
              {stageOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="u-grid-2 u-gap-3">
            <div className="admin-field">
              <label className="admin-label">Probability %</label>
              <input className="admin-input" type="number" min="0" max="100" value={probability} onChange={(e) => setProbability(e.target.value)} />
            </div>
            <div className="admin-field">
              <label className="admin-label">Expected close</label>
              <input className="admin-input" type="date" value={expectedClose} onChange={(e) => setExpectedClose(e.target.value)} />
            </div>
          </div>
          <div className="admin-field">
            <label className="admin-label">Source</label>
            <input className="admin-input" value={source} onChange={(e) => setSource(e.target.value)} />
          </div>
        </div>

        {error && (
          <div className="admin-alert admin-alert--err u-mt-3">
            {error}
          </div>
        )}

        <div className="admin-modal-actions">
          <button type="button" className="admin-btn" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
          <button type="button" className="admin-btn admin-btn--primary" onClick={apply} disabled={pending}>
            {pending ? "Applying…" : `Apply to ${count}`}
          </button>
        </div>
      </div>
    </div>
  );
}
