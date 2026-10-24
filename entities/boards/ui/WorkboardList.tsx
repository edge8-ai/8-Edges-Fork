"use client";

import { Fragment, useMemo, useState, type CSSProperties } from "react";
import { saigonToday } from "@/kernel/config/dates";
import type { WorkboardData } from "@/entities/boards/lib/workboard";
import { updateCard } from "@/entities/boards/lib/actions";
import { setCardSprint } from "@/entities/boards/lib/sprint-actions";
import { setTaskTokens } from "@/entities/boards/lib/token-actions";
import { moveCardToBoard } from "@/entities/boards/lib/move-to-board";
import type { Card, RunAction } from "./board-view-types";
import { groupColumns, groupingVocabulary } from "./workboard-grouping";
import { showMoveUndo } from "./undo-toast";
import { emptyRowLabel } from "./workboard-empty";
import { WorkboardListRow } from "./WorkboardListRow";
import { clientLabel } from "@/entities/boards/lib/card-facts";

type SortKey = "title" | "client" | "assignee" | "priority" | "sprint" | "tokens" | "due";

/**
 * The Workboard's list view (WB-03), quietened and grouped (W.108).
 *
 * It began as a table of forms: every row carried five selects and a date
 * input, so a surface that is read a hundred times for every edit wore the
 * chrome of an edit on every cell, and a card with no due date printed
 * "dd/mm/yyyy" where a fact belongs. Khoa set it beside ClickUp on
 * 2026-09-22, called it funky, and picked the "quiet table" prototype.
 *
 * So: the rows are grouped by lane, and each group's head carries the lane's
 * own status badge — the same `wb-col-badge` the board's column heads gained
 * in W.107, painted from the same accent. That is why there is no Status
 * column any more: the group IS the status, and a column repeating it would
 * be the second carrier of one fact. Every remaining editable cell reads as
 * text and swaps into its control on click, the board's W.93 pattern.
 *
 * Every write still goes through exactly the actions this view always used;
 * nothing about what a change means has changed, only what it takes to see
 * the card without making one.
 */
export function WorkboardList({
  data,
  cards,
  canEdit,
  filtersActive,
  saving,
  run,
  onOpen,
}: {
  data: WorkboardData;
  cards: Card[];
  canEdit: boolean;
  /** Some filter is narrowing the board, so an empty table says so (W.47). */
  filtersActive: boolean;
  saving: boolean;
  run: RunAction;
  onOpen: (card: Card) => void;
}) {
  const single = data.boards.length === 1;
  const boardById = useMemo(() => new Map(data.boards.map((b) => [b.id, b])), [data.boards]);
  const sprintName = useMemo(() => new Map(data.sprints.map((s) => [s.id, s.name])), [data.sprints]);
  const epicById = useMemo(() => new Map(data.epics.map((e) => [e.id, e])), [data.epics]);
  // The lanes with the accents the kanban gives their columns, so the badge on
  // a group head and the badge on the board's own column head are one colour.
  const laneColumns = useMemo(() => groupColumns("lane", [], groupingVocabulary(data)), [data]);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortAsc((a) => !a);
    else {
      setSortKey(k);
      setSortAsc(true);
    }
  }

  // Board choices, labelled by client; a client with several boards names them.
  const boardsPerClient = new Map<string, number>();
  for (const b of data.boards) boardsPerClient.set(b.client_company_id ?? "", (boardsPerClient.get(b.client_company_id ?? "") ?? 0) + 1);
  const boardLabel = (b: WorkboardData["boards"][number]) => {
    const client = clientLabel(b);
    return (boardsPerClient.get(b.client_company_id ?? "") ?? 0) > 1 ? `${client} · ${b.name}` : client;
  };
  const boardOptions = [...data.boards].sort((a, b) => boardLabel(a).localeCompare(boardLabel(b)));

  // The sort applies WITHIN a group, because the grouping is the outer order
  // and a sort that reordered the lanes would be answering a question nobody
  // asked. A null sortKey leaves each group in the order the server returned.
  const groups = useMemo(() => {
    const val = (c: Card): string | number => {
      switch (sortKey) {
        case "title": return c.title.toLowerCase();
        case "client": return (boardById.get(c.board_id ?? "")?.client_name ?? "").toLowerCase();
        case "assignee": return (c.assignee_name ?? "").toLowerCase();
        case "priority": return c.priority;
        case "sprint": return (c.sprint_id && sprintName.get(c.sprint_id)?.toLowerCase()) || "";
        case "tokens": return c.human_tokens ?? -1;
        case "due": return c.due_date ?? "9999";
        default: return 0;
      }
    };
    const sort = (rows: Card[]) => {
      if (!sortKey) return rows;
      return [...rows].sort((a, b) => {
        const x = val(a), y = val(b);
        const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
        return sortAsc ? r : -r;
      });
    };
    const known = new Set(laneColumns.map((l) => l.id));
    const built = laneColumns.map((l) => ({ id: l.id, label: l.label, accent: l.accent, rows: sort(cards.filter((c) => c.columnId === l.id)) }));
    // A card whose column is not one of the lanes would otherwise vanish from
    // a view whose whole job is to list every card, so it gets its own group
    // named after the column it is actually in.
    const orphans = cards.filter((c) => !known.has(c.columnId));
    const byColumn = new Map<string, Card[]>();
    for (const c of orphans) byColumn.set(c.columnId, [...(byColumn.get(c.columnId) ?? []), c]);
    for (const [id, rows] of byColumn) built.push({ id, label: id, accent: undefined, rows: sort(rows) });
    return built.filter((g) => g.rows.length > 0);
  }, [cards, sortKey, sortAsc, boardById, sprintName, laneColumns]);

  // A sprint commit is as undoable as a lane move (W.50): the toast offers the
  // way back and the server reads which sprint that is off the stage log, so a
  // row rendered before someone else touched the card cannot send it anywhere.
  function commitSprint(c: Card, sprintId: string | null, slug: string) {
    run(
      () => setCardSprint(c.id, sprintId, slug),
      () =>
        showMoveUndo({
          cardId: c.id,
          title: c.title,
          destination: (sprintId && sprintName.get(sprintId)) || "the backlog",
          slug,
          kind: "sprint",
        }),
    );
  }

  function saveTokens(c: Card, raw: string) {
    const next = raw.trim() === "" ? null : Number(raw);
    if (next !== null && !Number.isFinite(next)) return;
    if (next === c.human_tokens) return;
    run(() => setTaskTokens(c.id, next, boardById.get(c.board_id ?? "")?.slug ?? ""));
  }

  const columns: { key: SortKey; label: string; right?: boolean }[] = [
    { key: "title", label: "Card" },
    ...(single ? [] : [{ key: "client" as const, label: "Client" }]),
    { key: "assignee", label: "Assigned" },
    { key: "priority", label: "Pri" },
    { key: "sprint", label: "Sprint" },
    { key: "tokens", label: "HT", right: true },
    { key: "due", label: "Due" },
  ];
  const today = saigonToday();

  return (
    <div className="admin-table-wrap">
      <div className="admin-table-scroll">
        <table className="admin-table wb-list">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`${col.key === "title" ? "wb-list-col-title " : ""}${col.right ? "u-right " : ""}is-sortable`}
                  aria-sort={sortKey === col.key ? (sortAsc ? "ascending" : "descending") : "none"}
                >
                  {/* A quiet label, not a link (W.175): the head is read far more
                      than it is pressed, and seven blue words were the loudest
                      thing in the table. The sorted column carries the accent. */}
                  <button type="button" className="wb-list-sort" onClick={() => toggleSort(col.key)}>
                    {col.label}
                    {sortKey === col.key ? (sortAsc ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="admin-cell-muted">{emptyRowLabel(data.cards.length > 0, filtersActive)}</td>
              </tr>
            )}
            {groups.map((g) => (
              <Fragment key={g.id}>
                <tr className="wb-list-group">
                  {/* The accent is a value from the data, so it arrives as the
                      same custom property the kanban column sets — on the cell,
                      so the lane's colour also runs down the group head's left
                      edge as it runs across the top of the board's lane (W.175). */}
                  <td colSpan={columns.length} style={g.accent ? ({ "--kanban-accent": g.accent } as CSSProperties) : undefined}>
                    <span className="wb-col-badge">{g.label}</span>
                    <span className="wb-list-group-count">{g.rows.length}</span>
                  </td>
                </tr>
                {g.rows.map((c) => (
                  <WorkboardListRow
                    key={c.id}
                    card={c}
                    board={boardById.get(c.board_id ?? "")}
                    epic={epicById.get(c.epic_id ?? "")}
                    single={single}
                    canEdit={canEdit}
                    saving={saving}
                    today={today}
                    boardOptions={boardOptions}
                    boardLabel={boardLabel}
                    sprints={data.sprints.filter((s) => s.board_id === c.board_id && (s.status === "active" || s.id === c.sprint_id))}
                    sprintName={sprintName}
                    people={data.people}
                    onOpen={onOpen}
                    onBoard={(boardId) => run(() => moveCardToBoard(c.id, boardId))}
                    onAssignee={(personId) => run(() => updateCard(c.id, { assigneeId: personId }, boardById.get(c.board_id ?? "")?.slug ?? ""))}
                    onSprint={(sprintId) => commitSprint(c, sprintId, boardById.get(c.board_id ?? "")?.slug ?? "")}
                    onTokens={(raw) => saveTokens(c, raw)}
                    onDue={(date) => run(() => updateCard(c.id, { dueDate: date }, boardById.get(c.board_id ?? "")?.slug ?? ""))}
                  />
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
