"use client";

import { useState } from "react";
import type { CoachProfileDetail } from "@/entities/coaching/lib/data/profile";
import { addTalkingPoint, deleteTalkingPoint, resolveTalkingPoint } from "@/entities/coaching/lib/actions";
import { type ActionResult } from "./shared";

// The shared 1-1 agenda from the coach's side. The member raises points on
// their own page; the coach can add to the same list, remove any point, and
// mark points addressed once covered.
export function TalkingPointsCard({
  detail,
  run,
  busy,
}: {
  detail: CoachProfileDetail;
  run: (label: string, fn: () => Promise<ActionResult>, onOk?: () => void) => void;
  busy: boolean;
}) {
  const [body, setBody] = useState("");
  const add = () => {
    const text = body.trim();
    if (!text) return;
    run("Talking point", async () => {
      const res = await addTalkingPoint(detail.profileId, text);
      if (res.ok) setBody("");
      return res;
    });
  };

  return (
    <section
      className={`admin-card admin-coach-section${detail.talkingPoints.length > 0 ? " admin-coach-carried" : ""}`}
    >
      <div className="admin-card-title">
        Talking points <span className="admin-cell-muted">the agenda you and {detail.member.name} are building</span>
      </div>
      {detail.talkingPoints.length === 0 ? (
        <div className="admin-empty">
          Nothing raised yet. What {detail.member.name} adds on their own page, or what you add here, shows up on both
          pages and feeds the prep.
        </div>
      ) : (
        <div className="admin-hint">
          Raised for this 1-1 and folded into the prep. Mark addressed once you have covered it.
        </div>
      )}
      {detail.talkingPoints.map((t) => (
        <div key={t.id} className="admin-coach-carried-row">
          <span className="admin-coach-carried-title">{t.body}</span>
          <button
            className="admin-btn admin-btn--sm"
            disabled={busy}
            onClick={() => run("Talking point", () => resolveTalkingPoint(t.id))}
          >
            Mark addressed
          </button>
          <button
            className="admin-btn admin-btn--sm admin-btn--danger"
            disabled={busy}
            onClick={() => run("Talking point", () => deleteTalkingPoint(t.id))}
          >
            Remove
          </button>
        </div>
      ))}
      <div className="admin-coach-add-row">
        <input
          className="admin-input"
          placeholder={`Add a talking point for the next 1-1 with ${detail.member.name}…`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        <button className="admin-btn admin-btn--primary" disabled={busy || !body.trim()} onClick={add}>
          Add
        </button>
      </div>
    </section>
  );
}
