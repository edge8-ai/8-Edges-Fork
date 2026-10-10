"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { KanbanBoard, type KanbanColumn } from "@/kernel/ui/KanbanBoard";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { humanize } from "@/kernel/ui/format";
import { appPath } from "@/kernel/config/slug";
import { moveApplicationStage } from "../jobs/[id]/actions";
import { type AppRow } from "./ApplicationsTable";

// Columns are stage NAMES merged across open reqs (every req currently shares
// the Screen→…→Rejected template). stageMap resolves a name back to the stage
// id on one req, so a drag can reuse the per-req moveApplicationStage action.
export type StageMap = Record<string, Record<string, string>>;

// Role tags cycle a fixed hex palette (no CSS vars — the tint needs an alpha
// suffix). Assignment is by sorted req id, so a req keeps its color between
// renders regardless of row order.
const ROLE_COLORS = ["var(--admin-chart-3)", "var(--admin-chart-4)", "var(--admin-chart-2)", "var(--admin-warn-strong)", "var(--admin-ok-strong)", "var(--admin-muted)"];

type BoardCard = { id: string; columnId: string; row: AppRow };

export function ApplicationsBoard({
  rows,
  columns,
  stageMap,
}: {
  rows: AppRow[];
  columns: KanbanColumn[];
  stageMap: StageMap;
}) {
  const router = useRouter();
  const firstColumn = columns[0]?.id ?? "";
  // Board owns stage placement so drags are optimistic; everything else on the
  // card still reads from the untouched row.
  const [placement, setPlacement] = useState<Record<string, string>>({});
  const [reqFilter, setReqFilter] = useState("");
  const [banner, setBanner] = useState<string | null>(null);

  const reqOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      if (r.jobReqId && r.jobReqStatus === "open") m.set(r.jobReqId, r.jobReqTitle || "(untitled req)");
    }
    return [...m.entries()]
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [rows]);

  const roleColor = useMemo(() => {
    const ids = [...new Set(rows.map((r) => r.jobReqId).filter((id): id is string => Boolean(id)))].sort();
    return new Map(ids.map((id, i) => [id, ROLE_COLORS[i % ROLE_COLORS.length]]));
  }, [rows]);

  const cards: BoardCard[] = useMemo(() => {
    return rows
      .filter((r) => !r.archivedAt && (!reqFilter || r.jobReqId === reqFilter))
      .map((r) => ({
        id: r.id,
        columnId: placement[r.id] ?? r.stageName ?? firstColumn,
        row: r,
      }))
      .sort((a, b) => (b.row.aiRating ?? -1) - (a.row.aiRating ?? -1));
  }, [rows, reqFilter, placement, firstColumn]);

  function move(cardId: string, toColumnId: string) {
    const row = rows.find((r) => r.id === cardId);
    if (!row) return;
    const stageId = row.jobReqId ? stageMap[row.jobReqId]?.[toColumnId] : undefined;
    if (!stageId || !row.jobReqId) {
      setBanner(`${row.jobReqTitle || "This role"} has no "${toColumnId}" stage.`);
      return;
    }
    const prev = placement;
    setPlacement((p) => ({ ...p, [cardId]: toColumnId }));
    setBanner(null);
    moveApplicationStage(cardId, stageId, row.jobReqId).then((r) => {
      if (!r.ok) {
        setPlacement(prev);
        setBanner(`Couldn't move applicant: ${r.error}`);
      }
    });
  }

  return (
    <>
      <div className="admin-toolbar u-gap-3 u-wrap">
        <select
          className="admin-select u-max-4"
          value={reqFilter}
          onChange={(e) => setReqFilter(e.target.value)}
          aria-label="Filter board by job req"
        >
          <option value="">All open job reqs</option>
          {reqOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title}
            </option>
          ))}
        </select>
      </div>

      {banner && (
        <div className="admin-alert admin-alert--err u-mb-3">
          {banner}
        </div>
      )}

      {cards.length === 0 ? (
        <div className="admin-card u-p-4">
          <span className="admin-cell-muted">No applications match.</span>
        </div>
      ) : (
        <KanbanBoard<BoardCard>
          boardClassName="apps-board"
          columns={columns}
          cards={cards}
          onMove={move}
          onCardClick={(c) => router.push(appPath(c.row.candidateName, c.id))}
          renderCard={(c) => {
            const color = (c.row.jobReqId && roleColor.get(c.row.jobReqId)) || ROLE_COLORS[0];
            return (
              <>
                <div className="admin-kanban-card-title">{c.row.candidateName || "(unknown)"}</div>
                <div className="admin-kanban-card-sub">{c.row.headline || c.row.currentTitle || "—"}</div>
                <div className="admin-kanban-card-meta">
                  <span className="admin-kanban-role-tag" style={{ color, background: `${color}1f` }} /* layout-ok: role colour assigned per requisition at runtime */>
                    {c.row.jobReqTitle || "—"}
                  </span>
                </div>
                <div className="admin-kanban-card-meta">
                  {c.row.status && <Badge tone={statusTone(c.row.status)}>{humanize(c.row.status)}</Badge>}
                  {c.row.aiRating != null && (
                    <span className="admin-kanban-card-sub u-ml-auto">
                      AI {c.row.aiRating.toFixed(1)}
                    </span>
                  )}
                </div>
              </>
            );
          }}
        />
      )}
    </>
  );
}
