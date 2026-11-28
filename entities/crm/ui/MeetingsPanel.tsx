"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";

type ActionResult = { ok: boolean; error?: string };

// One programme option shape for the whole company hub; CompanyDocuments owns
// it and the crm door exports it from there.
import type { ProgramOption } from "./CompanyDocuments";

// Only these fields are rendered, so any meeting row shape works (the admin
// AdminMeetingRow, or the portal's PortalMeeting). The AI Program fields are
// optional: surfaces that do not load them just never show a tag.
type MeetingRowLike = {
  id: string;
  title: string | null;
  meetingDate: string | null;
  publishedAt: string | null;
  aiProgramId?: string | null;
  aiProgramName?: string | null;
};

// Client Hub meetings tab. Read-only list of meetings with their publish state.
// When `publishAction` is supplied (Edge8 surfaces), each row gets a Publish /
// Unpublish control; on client-facing surfaces it is omitted and the caller
// passes only already-published meetings. When `programAction` and
// `programOptions` are also supplied (same Edge8 surfaces), each row gets a
// small AI Program select ("Company-wide" = no tag), the same pattern as the
// documents tab. Client-facing renders show a tagged row's program name as
// muted text instead.
export function MeetingsPanel({
  meetings,
  publishAction,
  programAction,
  programOptions,
  detailBasePath,
}: {
  meetings: MeetingRowLike[];
  publishAction?: (id: string, published: boolean) => Promise<ActionResult>;
  programAction?: (id: string, programId: string | null) => Promise<ActionResult>;
  programOptions?: ProgramOption[];
  // When set, the meeting title links to `${detailBasePath}/${id}`.
  detailBasePath?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canTag = !!publishAction && !!programAction && (programOptions?.length ?? 0) > 0;

  function run(id: string, fn: () => Promise<ActionResult>) {
    setErr(null);
    setBusyId(id);
    start(async () => {
      const res = await fn();
      setBusyId(null);
      if (res.ok) router.refresh();
      else setErr(res.error ?? "Failed.");
    });
  }

  function toggle(id: string, next: boolean) {
    if (!publishAction) return;
    run(id, () => publishAction(id, next));
  }

  function setProgram(id: string, programId: string | null) {
    if (!programAction) return;
    run(id, () => programAction(id, programId));
  }

  if (meetings.length === 0) {
    return <div className="admin-empty">No meetings yet.</div>;
  }

  return (
    <>
      {err && <div className="admin-alert admin-alert--err u-mb-3">{err}</div>}
      <div className="admin-list">
        {meetings.map((m) => {
          const published = !!m.publishedAt;
          return (
            <div className="admin-list-row" key={m.id}>
              <div className="admin-list-main">
                <div className="admin-list-title">
                  {detailBasePath ? (
                    <Link href={`${detailBasePath}/${m.id}`}>{m.title || "Untitled meeting"}</Link>
                  ) : (
                    m.title || "Untitled meeting"
                  )}
                </div>
                {(m.meetingDate || (!canTag && m.aiProgramName)) && (
                  <div className="admin-list-sub">
                    {m.meetingDate && formatDate(m.meetingDate)}
                    {!canTag && m.aiProgramName && `${m.meetingDate ? " · " : ""}${m.aiProgramName}`}
                  </div>
                )}
              </div>
              <div className="admin-list-aside u-row u-gap-2">
                {canTag && (
                  <select
                    className="admin-select u-max-3"
                    value={m.aiProgramId ?? ""}
                    disabled={pending && busyId === m.id}
                    onChange={(e) => setProgram(m.id, e.target.value || null)}
                    aria-label="Tag this meeting to an AI Program (optional)"
                  >
                    <option value="">Company-wide</option>
                    {(programOptions ?? []).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                )}
                <Badge tone={published ? "ok" : "neutral"}>{published ? "Published" : "Draft"}</Badge>
                {publishAction && (
                  <button
                    className="admin-btn admin-btn--sm"
                    disabled={pending && busyId === m.id}
                    onClick={() => toggle(m.id, !published)}
                  >
                    {published ? "Unpublish" : "Publish"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
