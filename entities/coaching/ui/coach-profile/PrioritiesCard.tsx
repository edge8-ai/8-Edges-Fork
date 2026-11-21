"use client";

import { useState } from "react";
import type { CoachProfileDetail } from "@/entities/coaching/lib/data/profile";
import { addPriority, updatePriority } from "@/entities/coaching/lib/actions";
import { type ActionResult } from "./shared";
import { PriorityLinkEditor } from "./PriorityLinkEditor";

export function PrioritiesCard({
  detail,
  run,
  busy,
}: {
  detail: CoachProfileDetail;
  run: (label: string, fn: () => Promise<ActionResult>, onOk?: () => void) => void;
  busy: boolean;
}) {
  const [title, setTitle] = useState("");
  const [detailMd, setDetailMd] = useState("");
  const active = detail.priorities.filter((p) => p.status === "active");
  const retired = detail.priorities.filter((p) => p.status === "retired");

  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">
        Priorities{" "}
        <span className="admin-cell-muted">(personal growth: what matters most from your view, reviewed every 1-1)</span>
      </div>

      {active.length === 0 && <div className="admin-empty">No standing priorities.</div>}
      {active.map((p) => (
        <div key={p.id} className="admin-coach-commitment">
          <div className="admin-coach-commitment-main">
            <span className="admin-coach-commitment-title">{p.title}</span>
          </div>
          {p.detailMarkdown && <div className="admin-cell-muted admin-coach-priority-detail">{p.detailMarkdown}</div>}
          {p.link && (
            <div className="admin-cell-muted admin-coach-priority-detail">
              Attached: {p.link.title} — {p.link.url}
            </div>
          )}
          <div className="admin-coach-commitment-controls">
            <PriorityLinkEditor
              link={p.link}
              busy={busy}
              onSave={(link) => run("Priority", () => updatePriority(detail.profileId, p.id, { link }))}
            />
            <button
              className="admin-btn admin-btn--sm"
              disabled={busy}
              onClick={() => run("Priority", () => updatePriority(detail.profileId, p.id, { status: "retired" }))}
            >
              Retire
            </button>
          </div>
        </div>
      ))}

      <div className="admin-coach-add-row">
        <input
          className="admin-input"
          placeholder="New priority (e.g. P1: Own AI Labs)…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className="admin-input"
          placeholder="Detail (optional)…"
          value={detailMd}
          onChange={(e) => setDetailMd(e.target.value)}
        />
        <button
          className="admin-btn"
          disabled={busy || !title.trim()}
          onClick={() => {
            run("Priority", () => addPriority(detail.profileId, title, detailMd, { kind: "none" }), () => {
              setTitle("");
              setDetailMd("");
            });
          }}
        >
          Add
        </button>
      </div>

      {retired.length > 0 && (
        <details open className="admin-coach-closed">
          <summary>{retired.length} retired</summary>
          {retired.map((p) => (
            <div key={p.id} className="admin-coach-commitment is-closed">
              <span>{p.title}</span>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
