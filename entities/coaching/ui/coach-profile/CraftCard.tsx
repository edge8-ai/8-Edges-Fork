"use client";

import type { CoachProfileDetail } from "@/entities/coaching/lib/data/profile";
import { RETENTION_ROOT_LABELS } from "@/entities/coaching/lib/types";
import { dayOnly } from "@/entities/coaching/lib/help-words";

// The two coach-craft diagnostics, on the tab a coach reads while preparing the
// next 1-1 (K.47). They used to sit as columns on the roster, where they read
// as a score against each person; here they sit beside the conversation they
// describe, each with the one sentence that says what it means and why it is
// worth a glance before the meeting.
//
// Neither figure describes a person. The mode split describes how one
// conversation was spent, and the loose root is the coach's own read of what
// holds somebody here — the sentences say so out loud, because a bare
// percentage next to a name is exactly the thing this product does not do.
export function CraftCard({ detail }: { detail: CoachProfileDetail }) {
  // The most recent 1-1 that actually happened and carries a split. The list
  // arrives newest-first, so the first match is the latest one.
  const last = detail.meetings.find((m) => m.status === "held" && m.modeSplit !== null);
  const mode = last?.modeSplit ? { split: last.modeSplit, heldOn: last.heldOn } : null;

  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">Coach&rsquo;s craft</div>

      <div className="coach-craft-item">
        <div className="coach-craft-label">Mode of the last 1-1 — target 80 / 15 / 5</div>
        {mode ? (
          <div className="coach-craft-value">
            {mode.split.coach}% coach · {mode.split.mentor}% mentor · {mode.split.direct}% direct
            <span className="coach-craft-when"> · from your 1-1 on {dayOnly(mode.heldOn)}</span>
          </div>
        ) : (
          <div className="coach-craft-value coach-craft-value--quiet">No read yet</div>
        )}
        <p className="admin-hint u-m-0">
          {mode
            ? "How that one conversation divided between asking (coach), teaching (mentor) and telling (direct), estimated from its transcript. The aim is to spend most of it asking. It describes the conversation, not the person you had it with — a week that genuinely needed teaching should read like one."
            : "Once a 1-1 has a transcript summarised, this estimates how it divided between asking (coach), teaching (mentor) and telling (direct). The aim is to spend most of it asking. It describes the conversation, never the person you had it with."}
        </p>
      </div>

      <div className="coach-craft-item">
        <div className="coach-craft-label">Loose engagement root</div>
        <div className={`coach-craft-value${detail.retentionRoot ? "" : " coach-craft-value--quiet"}`}>
          {detail.retentionRoot ? RETENTION_ROOT_LABELS[detail.retentionRoot] : "Watching — no confident read yet"}
        </div>
        <p className="admin-hint u-m-0">
          Your private read of what loosely holds them here: whether they belong, who they are linked
          to, or what they would give up by leaving. It is a hypothesis you carry into the
          conversation, not a verdict, and only you ever see it. Change it under Person.
        </p>
      </div>
    </section>
  );
}
