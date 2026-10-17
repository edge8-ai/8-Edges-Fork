"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Badge } from "@/kernel/ui/Badge";
import { humanize } from "@/kernel/ui/format";
import type { MayProp } from "@/kernel/identity/may-prop";
import { fitChip } from "@/entities/crm/lib/inquiry-triage-shapes";
import { pinLead, unpinLead } from "./actions";
import { LeadDetail } from "./LeadDetail";
import type { QueueRow } from "./lead-queue-types";

export type { QueueRow } from "./lead-queue-types";

function slaBadge(slaDueAt: string | null) {
  if (!slaDueAt) return null;
  const mins = Math.round((new Date(slaDueAt).getTime() - Date.now()) / 60000);
  if (mins < 0) {
    const h = Math.floor(-mins / 60);
    return <Badge tone="err">SLA overdue {h > 0 ? `${h}h` : `${-mins}m`}</Badge>;
  }
  if (mins < 60) return <Badge tone="err">Respond in {mins}m</Badge>;
  return <Badge tone="warn">Respond in {Math.round(mins / 60)}h</Badge>;
}

function statusBadge(status: string) {
  const tone =
    status === "meeting_booked" ? "ok" : status === "connected" ? "info" : "neutral";
  return <Badge tone={tone}>{humanize(status)}</Badge>;
}

// `may` (ADR 0014): the queue's controls show only to someone who may work it;
// each action's own guard still refuses.
export function LeadQueue({ rows, may }: { rows: QueueRow[]; may: MayProp }) {
  const canWork = may["crm.pipeline"] === true;
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(rows[0]?.id ?? null);
  const [banner, setBanner] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Local copy so a drag can flip pinned state immediately; resynced whenever
  // the server sends a fresh (SLA-recomputed) order after a round-trip.
  const [localRows, setLocalRows] = useState(rows);
  useEffect(() => setLocalRows(rows), [rows]);

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBanner(null);
    startTransition(async () => {
      const r = await action();
      if (!r.ok) setBanner(r.error);
      else router.refresh();
    });
  }

  // Two drop zones, not one continuous list: dropping into "Pinned" pins the
  // lead (boosted above the SLA queue), dropping into "Queue" unpins it. This
  // gives drag a whole zone to land in rather than a single precise slot — a
  // one-index-wide target got fragile once anything was already pinned.
  // Reordering within a zone is a no-op; neither zone tracks relative order.
  function handleDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;
    if (!destination || destination.droppableId === source.droppableId) return;
    const row = localRows.find((r) => r.id === draggableId);
    if (!row) return;

    const nowPinned = destination.droppableId === "pinned-zone";
    setLocalRows((rs) =>
      rs.map((r) => (r.id === draggableId ? { ...r, pinnedAt: nowPinned ? new Date().toISOString() : null } : r)),
    );
    run(() => (nowPinned ? pinLead(row.id) : unpinLead(row.id)));
  }

  if (rows.length === 0) {
    return (
      <div className="admin-empty">
        Queue is clear. Promote people from Contacts, or wait for inbound.
      </div>
    );
  }

  const pinnedRows = localRows.filter((r) => r.pinnedAt);
  const queueRows = localRows.filter((r) => !r.pinnedAt);

  function renderCard(r: QueueRow, i: number) {
    const open = openId === r.id;
    // The qualifier's fit is shown, never used to order the queue (decision 15).
    const fit = fitChip(r.qualifier);
    return (
      <Draggable draggableId={r.id} index={i} key={r.id} isDragDisabled={!canWork}>
        {(dp, ds) => (
          <div
            ref={dp.innerRef}
            {...dp.draggableProps}
            className={`admin-lead-card${open ? " is-open" : ""}${r.pinnedAt ? " is-pinned" : ""}${ds.isDragging ? " is-dragging" : ""}`}
          >
            <div
              className="admin-lead-head"
              role="button"
              tabIndex={0}
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : r.id)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                setOpenId(open ? null : r.id);
              }}
            >
              <span
                className="admin-lead-drag-handle"
                {...dp.dragHandleProps}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Drag ${r.name} to pin or unpin`}
                title={r.pinnedAt ? "Drag down to the queue to unpin" : "Drag up to Pinned to boost to the top"}
              >
                ⠿
              </span>
              <div className="admin-lead-head-main">
                <div className="admin-lead-name">
                  {r.name}
                  {r.company ? <span className="admin-cell-muted"> · {r.company}</span> : null}
                </div>
                <div className="admin-lead-sub">
                  {r.qualifier?.reasons[0] || r.inquiry?.subject || r.inquiry?.message || r.email}
                </div>
              </div>
              <div className="admin-lead-head-meta">
                {r.pinnedAt && <Badge tone="info">Pinned</Badge>}
                {fit && <Badge tone={fit.tone}>{fit.label}</Badge>}
                {slaBadge(r.slaDueAt)}
                {statusBadge(r.status)}
                <span className="admin-lead-attempt">
                  {r.attemptCount > 0 ? `attempt ${r.attemptCount}` : "no attempts"}
                </span>
                {canWork && (
                  <button
                    type="button"
                    className={`admin-lead-pin-btn${r.pinnedAt ? " is-active" : ""}`}
                    aria-pressed={!!r.pinnedAt}
                    title={r.pinnedAt ? "Unpin from top of queue" : "Pin to top of queue"}
                    disabled={pending}
                    onClick={(e) => {
                      e.stopPropagation();
                      run(() => (r.pinnedAt ? unpinLead(r.id) : pinLead(r.id)));
                    }}
                  >
                    {r.pinnedAt ? "★" : "☆"}
                  </button>
                )}
              </div>
            </div>

            {open && <LeadDetail row={r} pending={pending} run={run} may={may} />}
          </div>
        )}
      </Draggable>
    );
  }

  return (
    <>
      {banner && (
        <div className="admin-alert admin-alert--err u-mb-3">
          {banner}
        </div>
      )}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="admin-lead-zone-label">Pinned</div>
        <Droppable droppableId="pinned-zone">
          {(provided, snapshot) => (
            <div
              className={`admin-lead-queue admin-lead-zone${snapshot.isDraggingOver ? " is-drop-target" : ""}`}
              ref={provided.innerRef}
              {...provided.droppableProps}
            >
              {pinnedRows.length === 0 && !snapshot.isDraggingOver && (
                <div className="admin-lead-zone-empty">Drag a lead here to pin it above the queue</div>
              )}
              {pinnedRows.map((r, i) => renderCard(r, i))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>

        {pinnedRows.length > 0 && <div className="admin-lead-zone-label">Queue</div>}
        <Droppable droppableId="queue-zone">
          {(provided, snapshot) => (
            <div
              className={`admin-lead-queue${snapshot.isDraggingOver ? " is-drop-target" : ""}`}
              ref={provided.innerRef}
              {...provided.droppableProps}
            >
              {queueRows.map((r, i) => renderCard(r, i))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </>
  );
}
