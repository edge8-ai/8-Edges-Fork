"use client";

import { useState } from "react";
import type { CoachProfileDetail } from "@/entities/coaching/lib/data/profile";
import type { OceanDimensionKey } from "@/entities/coaching/lib/types";
import { OCEAN_DIMENSIONS } from "@/entities/coaching/lib/types";
import { publishOcean, saveOcean } from "@/entities/coaching/lib/actions";
import { type ActionResult, OCEAN_LABELS } from "./shared";

export function OceanCard({
  detail,
  run,
  busy,
}: {
  detail: CoachProfileDetail;
  run: (label: string, fn: () => Promise<ActionResult>, onOk?: () => void) => void;
  busy: boolean;
}) {
  const o = detail.ocean;
  const [editing, setEditing] = useState(false);
  const [dims, setDims] = useState<Record<OceanDimensionKey, { rating: string; evidence: string }>>(() => {
    const init = {} as Record<OceanDimensionKey, { rating: string; evidence: string }>;
    for (const k of OCEAN_DIMENSIONS)
      init[k] = { rating: o?.[k]?.rating ?? "", evidence: o?.[k]?.evidence ?? "" };
    return init;
  });
  const [snapshot, setSnapshot] = useState(o?.snapshotMarkdown ?? "");
  const [guidance, setGuidance] = useState(o?.guidanceMarkdown ?? "");
  const published = Boolean(o?.published);

  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-coach-block-head">
        <div className="admin-card-title">OCEAN profile</div>
        <div className="admin-coach-block-actions">
          {/* Only once there is a read to describe (G.7). Rendered
              unconditionally, this said "Draft: only you" in the warn colour on
              a profile with no OCEAN at all — directly above the card's own
              "No OCEAN profile yet." — so the card contradicted itself and
              asked for attention nothing needed. The Publish button beside it
              was already gated on `o`; the badge was not. */}
          {o && (
            <span className={`admin-badge ${published ? "admin-badge--ok" : "admin-badge--warn"}`}>
              {published ? "Published: they can read it" : "Draft: only you"}
            </span>
          )}
          <button className="admin-btn admin-btn--sm" onClick={() => setEditing((v) => !v)}>
            {editing ? "Cancel" : o ? "Edit" : "Write one"}
          </button>
          {o && (
            <button
              className={`admin-btn admin-btn--sm ${published ? "" : "admin-btn--primary"}`}
              disabled={busy}
              onClick={() => run("OCEAN", () => publishOcean(detail.profileId, !published))}
            >
              {published ? "Unpublish" : "Publish to them"}
            </button>
          )}
        </div>
      </div>
      <div className="admin-hint">
        Ratings with behavioral evidence, a snapshot, and growth guidance written to them in second
        person. They see the full profile once published; discussion happens in the 1-1.
      </div>

      {editing ? (
        <div className="admin-form">
          {OCEAN_DIMENSIONS.map((k) => (
            <div key={k} className="admin-coach-field-row admin-coach-ocean-row">
              <div className="admin-field admin-coach-ocean-rating">
                <label className="admin-label">{OCEAN_LABELS[k]}</label>
                <input
                  className="admin-input"
                  placeholder="High / Medium / Low / TBD…"
                  value={dims[k].rating}
                  onChange={(e) => setDims({ ...dims, [k]: { ...dims[k], rating: e.target.value } })}
                />
              </div>
              <div className="admin-field admin-coach-ocean-evidence">
                <label className="admin-label">Behavioral evidence</label>
                <textarea
                  className="admin-input"
                  rows={2}
                  value={dims[k].evidence}
                  onChange={(e) => setDims({ ...dims, [k]: { ...dims[k], evidence: e.target.value } })}
                />
              </div>
            </div>
          ))}
          <div className="admin-field">
            <label className="admin-label">Personality snapshot</label>
            <textarea className="admin-input" rows={4} value={snapshot} onChange={(e) => setSnapshot(e.target.value)} />
          </div>
          <div className="admin-field">
            <label className="admin-label">Growth guidance (second person, written to them)</label>
            <textarea className="admin-input" rows={8} value={guidance} onChange={(e) => setGuidance(e.target.value)} />
          </div>
          <div className="admin-form-actions">
            <button
              className="admin-btn admin-btn--primary"
              disabled={busy}
              onClick={() => {
                run("OCEAN", () => saveOcean(detail.profileId, { dims, snapshot, guidance }), () => setEditing(false));
              }}
            >
              Save
            </button>
          </div>
        </div>
      ) : o ? (
        <div>
          <div className="admin-coach-ocean-list">
            {OCEAN_DIMENSIONS.map((k) => (
              <div key={k} className="admin-coach-ocean-line">
                <div className="admin-coach-ocean-line-head">
                  <strong>{OCEAN_LABELS[k]}</strong>
                  <span className="admin-badge admin-badge--info">{o[k].rating ?? "TBD"}</span>
                </div>
                {o[k].evidence && <div className="admin-cell-muted admin-coach-ocean-line-evidence">{o[k].evidence}</div>}
              </div>
            ))}
          </div>
          {o.snapshotMarkdown && (
            <div className="admin-coach-block">
              <span className="admin-eyebrow">Snapshot</span>
              <p>{o.snapshotMarkdown}</p>
            </div>
          )}
          {o.guidanceMarkdown && (
            <div className="admin-coach-block">
              <span className="admin-eyebrow">Growth guidance (they read this)</span>
              <p className="admin-coach-ocean-guidance">{o.guidanceMarkdown}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="admin-empty">No OCEAN profile yet.</div>
      )}
    </section>
  );
}
