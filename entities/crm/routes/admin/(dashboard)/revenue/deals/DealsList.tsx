"use client";

import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import type { KanbanColumn } from "@/kernel/ui/KanbanBoard";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { Icon } from "@/kernel/ui/Icon";
import { formatCents, formatDate, humanize } from "@/kernel/ui/format";
import { HANDOFF_COLUMN_ID } from "./constants";
import type { DealCard } from "./types";
import { idleDays, type ListSort } from "./board-helpers";

export function DealsList({
  cards,
  columns,
  selected,
  onToggle,
  onToggleAll,
  onRowClick,
  sort,
  onSort,
  reorderEnabled,
  onReorder,
  emptyText,
}: {
  cards: DealCard[];
  columns: KanbanColumn[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onRowClick: (card: DealCard) => void;
  sort: ListSort | null;
  onSort: (key: string) => void;
  reorderEnabled: boolean;
  onReorder: (cardId: string, columnId: string, toIndex: number) => void;
  emptyText: string;
}) {
  const stageLabel = new Map(columns.map((c) => [c.id, c.label]));
  const allSelected = cards.length > 0 && cards.every((c) => selected.has(c.id));
  const colCount = reorderEnabled ? 8 : 7;

  const sortableTh = (label: string, key: string, align?: "right") => (
    <th style={align === "right" ? { textAlign: "right" } : undefined}>
      <button type="button" className="admin-th-sort" onClick={() => onSort(key)}>
        {label}
        {sort?.key === key ? (sort.dir === "desc" ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );

  function handleDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;
    if (!destination || destination.droppableId !== source.droppableId) return;
    if (destination.index === source.index) return;
    onReorder(draggableId, destination.droppableId, destination.index);
  }

  function rowCells(c: DealCard) {
    const d = idleDays(c.updatedAt);
    const idle = c.status === "open" && d != null && d > 14;
    const isSel = selected.has(c.id);
    return (
      <>
        <td className="admin-cell-check" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            aria-label={`Select ${c.title || "deal"}`}
            checked={isSel}
            onChange={() => onToggle(c.id)}
          />
        </td>
        <td>
          <div className="admin-cell-strong">
            {c.title || c.contactName || c.companyName || "(untitled deal)"}
          </div>
          <div className="admin-cell-muted">{c.companyName || c.contactName || "—"}</div>
        </td>
        <td>
          {c.columnId === HANDOFF_COLUMN_ID ? (
            <Badge tone="warn">New from SDR</Badge>
          ) : (
            stageLabel.get(c.columnId) ?? "—"
          )}
        </td>
        <td className="u-right">{formatCents(c.amountUsdCents, "usd")}</td>
        <td className="u-right">{c.probability != null ? `${c.probability}%` : "—"}</td>
        <td>
          {c.status !== "open" ? (
            <span className="admin-cell-muted">—</span>
          ) : c.nextStepDate ? (
            <span>
              {c.nextStep || "next step"} · {formatDate(c.nextStepDate)}
            </span>
          ) : (
            <span className="u-strong u-err">No next step</span>
          )}
        </td>
        <td>
          <Badge tone={statusTone(c.status ?? "")}>{humanize(c.status)}</Badge>
          {idle && (
            <>
              {" "}
              <Badge tone="warn">idle {d}d</Badge>
            </>
          )}
        </td>
      </>
    );
  }

  const groups = reorderEnabled
    ? columns.map((col) => ({ col, rows: cards.filter((c) => c.columnId === col.id) })).filter((g) => g.rows.length > 0)
    : null;

  return (
    <div className="admin-table-wrap">
      <div className="admin-table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              {reorderEnabled && <th className="admin-cell-drag" aria-hidden />}
              <th className="admin-cell-check">
                <input type="checkbox" aria-label="Select all deals" checked={allSelected} onChange={onToggleAll} />
              </th>
              {sortableTh("Deal", "deal")}
              {sortableTh("Stage", "stage")}
              {sortableTh("Amount", "amount", "right")}
              {sortableTh("Prob", "prob", "right")}
              {sortableTh("Next step", "nextstep")}
              {sortableTh("Status", "status")}
            </tr>
          </thead>
          {cards.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={colCount}>
                  <div className="admin-empty">{emptyText}</div>
                </td>
              </tr>
            </tbody>
          ) : groups ? (
            <DragDropContext onDragEnd={handleDragEnd}>
              {groups.map(({ col, rows }) => (
                <Droppable droppableId={col.id} key={col.id}>
                  {(provided) => (
                    <tbody ref={provided.innerRef} {...provided.droppableProps}>
                      <tr className="admin-table-group-row">
                        <td colSpan={colCount}>{col.label}</td>
                      </tr>
                      {rows.map((c, i) => (
                        <Draggable draggableId={c.id} index={i} key={c.id}>
                          {(dp, ds) => (
                            <tr
                              ref={dp.innerRef}
                              {...dp.draggableProps}
                              className={`is-clickable${selected.has(c.id) ? " is-selected" : ""}${c.archivedAt ? " admin-row-archived" : ""}${ds.isDragging ? " is-dragging" : ""}`}
                              onClick={() => onRowClick(c)}
                            >
                              <td className="admin-cell-drag" {...dp.dragHandleProps} onClick={(e) => e.stopPropagation()}>
                                <Icon name="grip" />
                              </td>
                              {rowCells(c)}
                            </tr>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </tbody>
                  )}
                </Droppable>
              ))}
            </DragDropContext>
          ) : (
            <tbody>
              {cards.map((c) => (
                <tr
                  key={c.id}
                  className={`is-clickable${selected.has(c.id) ? " is-selected" : ""}${c.archivedAt ? " admin-row-archived" : ""}`}
                  onClick={() => onRowClick(c)}
                >
                  {rowCells(c)}
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>
    </div>
  );
}
