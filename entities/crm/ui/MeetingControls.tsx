"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setMeetingPublished,
  deleteMeeting,
  retryMeetingSummary,
  updateMeeting,
} from "@/entities/crm/lib/meetings-actions";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";

// Per-meeting admin controls: publish toggle (the portal gate), AI retry,
// delete, and an inline edit form for title / date / attendees / summary. The
// summary/transcript display is server-rendered by the Details page; this only
// owns the mutations, then router.refresh() re-renders. Deleting leaves nothing
// to render, so it navigates to `redirectAfterDelete` instead.
export function MeetingControls({
  id,
  published,
  aiStatus,
  initial,
  redirectAfterDelete,
}: {
  id: string;
  published: boolean;
  aiStatus: "pending" | "ready" | "failed";
  initial: { title: string; meetingDate: string; attendees: string; summary: string };
  redirectAfterDelete: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fields, setFields] = useState(initial);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErr(null);
    start(async () => {
      const res = await fn();
      if (res.ok) router.refresh();
      else setErr(res.error ?? "Something went wrong.");
    });
  }

  return (
    <div className="u-mt-3">
      {err && <div className="admin-alert admin-alert--err u-mb-2">{err}</div>}

      <div className="u-row u-wrap u-gap-2">
        <button
          type="button"
          className={`admin-btn ${published ? "" : "admin-btn--primary"}`}
          disabled={pending}
          onClick={() => run(() => setMeetingPublished(id, !published))}
        >
          {published ? "Unpublish" : "Publish to client"}
        </button>
        <button type="button" className="admin-btn" disabled={pending} onClick={() => setEditing((v) => !v)}>
          {editing ? "Cancel" : "Edit"}
        </button>
        {aiStatus === "failed" && (
          <button type="button" className="admin-btn" disabled={pending} onClick={() => run(() => retryMeetingSummary(id))}>
            Retry summary
          </button>
        )}
        <ConfirmButton
          label="Delete"
          title="Delete this meeting permanently?"
          body="This removes the transcript and cannot be undone."
          confirmLabel="Delete meeting"
          disabled={pending}
          onConfirm={() => deleteMeeting(id)}
          onDone={() => router.push(redirectAfterDelete)}
        />
      </div>

      {editing && (
        <div className="admin-form u-mt-3">
          <div className="u-row u-wrap">
            <div className="admin-field u-flex-2">
              <label className="admin-label">Title</label>
              <input
                className="admin-input"
                value={fields.title}
                onChange={(e) => setFields({ ...fields, title: e.target.value })}
              />
            </div>
            <div className="admin-field u-flex-1">
              <label className="admin-label">Meeting date</label>
              <input
                type="date"
                className="admin-input"
                value={fields.meetingDate}
                onChange={(e) => setFields({ ...fields, meetingDate: e.target.value })}
              />
            </div>
          </div>
          <div className="admin-field">
            <label className="admin-label">Attendees</label>
            <input
              className="admin-input"
              value={fields.attendees}
              onChange={(e) => setFields({ ...fields, attendees: e.target.value })}
              placeholder="Comma-separated"
            />
          </div>
          <div className="admin-field">
            <label className="admin-label">Summary (Markdown)</label>
            <textarea
              className="admin-input admin-textarea--grow"
              rows={8}
              value={fields.summary}
              onChange={(e) => setFields({ ...fields, summary: e.target.value })}
            />
          </div>
          <div className="admin-form-actions">
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const res = await updateMeeting(id, fields);
                  if (res.ok) setEditing(false);
                  return res;
                })
              }
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
