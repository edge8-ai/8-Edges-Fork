"use client";

import { useState } from "react";
import type { OneOnOne } from "@/entities/coaching/lib/data/profile";
import { publishRecap, saveSummaries } from "@/entities/coaching/lib/meeting-actions";
import type { ActionResult } from "./shared";

// The private summary and the shared recap of one 1-1, with the edit form and
// the publish toggle. Split out of MeetingRow (Q3); it owns the edit state.
export function MeetingSummaries({
  m,
  html,
  run,
  busy,
}: {
  m: OneOnOne;
  html: { summary: string | null; shared: string | null } | undefined;
  run: (label: string, fn: () => Promise<ActionResult>, onOk?: () => void) => void;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [privateMd, setPrivateMd] = useState(m.summaryMarkdown ?? "");
  const [sharedMd, setSharedMd] = useState(m.sharedSummaryMarkdown ?? "");
  const published = Boolean(m.sharedPublishedAt);

  return (
    <>
      {(m.summaryMarkdown || m.sharedSummaryMarkdown) && (
        <div className="admin-coach-block">
          <div className="admin-coach-block-head">
            <span className="admin-eyebrow">Summaries</span>
            <div className="admin-coach-block-actions">
              <button className="admin-btn admin-btn--sm" onClick={() => setEditing((v) => !v)}>
                {editing ? "Cancel edit" : "Edit"}
              </button>
              <button
                className={`admin-btn admin-btn--sm ${published ? "" : "admin-btn--primary"}`}
                disabled={busy}
                onClick={() => run("Publish", () => publishRecap(m.id, !published))}
              >
                {published ? "Unpublish recap" : "Publish recap to them"}
              </button>
            </div>
          </div>

          {editing ? (
            <div className="admin-form">
              <div className="admin-field">
                <label className="admin-label">Private summary (only you)</label>
                <textarea
                  className="admin-input"
                  rows={10}
                  value={privateMd}
                  onChange={(e) => setPrivateMd(e.target.value)}
                />
              </div>
              <div className="admin-field">
                <label className="admin-label">Shared recap (they see this once published)</label>
                <textarea
                  className="admin-input"
                  rows={8}
                  value={sharedMd}
                  onChange={(e) => setSharedMd(e.target.value)}
                />
              </div>
              <div className="admin-form-actions">
                <button
                  className="admin-btn admin-btn--primary"
                  disabled={busy}
                  onClick={() => {
                    run("Summaries", () => saveSummaries(m.id, privateMd, sharedMd));
                    setEditing(false);
                  }}
                >
                  Save both
                </button>
              </div>
            </div>
          ) : (
            <div className="admin-coach-summaries">
              <div>
                <div className="admin-coach-tier-label">Private: only you</div>
                {html?.summary ? (
                  <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: html.summary }} />
                ) : (
                  <div className="admin-cell-muted">No private summary.</div>
                )}
              </div>
              <div>
                <div className="admin-coach-tier-label">
                  Shared recap: {published ? "published to them" : "draft, they can't see it yet"}
                </div>
                {html?.shared ? (
                  <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: html.shared }} />
                ) : (
                  <div className="admin-cell-muted">No shared recap.</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
