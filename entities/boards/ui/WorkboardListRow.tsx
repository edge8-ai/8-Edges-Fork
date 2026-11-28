"use client";

import { PRIORITY_LABEL, initials } from "@/entities/boards/lib/types";
import { cardFacts } from "@/entities/boards/lib/card-facts";
import type { WorkboardData } from "@/entities/boards/lib/workboard";
import { sumSubtaskTokens } from "@/entities/boards/lib/tokens";
import { shortSprintName } from "@/entities/boards/lib/chip-label";
import type { Card } from "./board-view-types";
import { WorkboardQuickAssignee } from "./WorkboardQuickAssignee";
import { WorkboardListEdit, ListDash, ListDue, closeHandlers } from "./WorkboardListEdit";
import { CardEdge } from "./WorkboardCardEdge";
import type { EpicRow } from "@/entities/boards/lib/types";

type Board = WorkboardData["boards"][number];
type Sprint = WorkboardData["sprints"][number];

/**
 * One card as one line (W.108).
 *
 * Every cell reads as the fact it holds and swaps into its control on click,
 * which is the board's W.93 pattern applied to the table. There is no Status
 * cell, because the group the row sits in IS the status — the lane's badge is
 * the section head above it, so a column repeating it on every row would say
 * the same thing twice.
 *
 * Priority is weight and position, never hue (W.48): P1 in ink, P2 and P3
 * muted, no badge and no colour. A coloured priority would put a second
 * palette on a surface whose only accent is the lane badge, and colour on a
 * card is reserved for the client.
 *
 * The title cell carries the card's 3px edge (W.175), the same CardEdge the
 * board's card and the Calendar's row draw, so a row says which client or epic
 * it belongs to in the colour the other two views use. The Due cell is
 * ListDue (WorkboardListEdit.tsx), worded the way the card face is.
 */
export function WorkboardListRow({
  card,
  board,
  epic,
  single,
  canEdit,
  saving,
  today,
  boardOptions,
  boardLabel,
  sprints,
  sprintName,
  people,
  onOpen,
  onBoard,
  onAssignee,
  onSprint,
  onTokens,
  onDue,
}: {
  card: Card;
  board: Board | undefined;
  epic: EpicRow | undefined;
  /** One board in scope, so the client column and the board subline go away. */
  single: boolean;
  canEdit: boolean;
  saving: boolean;
  today: string;
  boardOptions: Board[];
  boardLabel: (b: Board) => string;
  /** This card's own board's sprints, which are the only ones it may join. */
  sprints: Sprint[];
  sprintName: Map<string, string>;
  people: WorkboardData["people"];
  onOpen: (card: Card) => void;
  onBoard: (boardId: string) => void;
  onAssignee: (personId: string | null) => void;
  onSprint: (sprintId: string | null) => void;
  onTokens: (raw: string) => void;
  onDue: (date: string | null) => void;
}) {
  const c = card;
  const facts = cardFacts(c, { today, board }); // one module decides a card's facts (A.29.1)
  const { overdue, clientLabel: clientName } = facts;
  const sprintFull = (c.sprint_id && sprintName.get(c.sprint_id)) || null;
  // A card whose subtasks are sized carries their sum, so its own figure is
  // derived and must not be typed over (the Human Token rule in CLAUDE.md).
  const tokensDerived = sumSubtaskTokens(c.subtasks) !== null;

  return (
    <tr>
      {/* The title is the one thing in ink, one line wide, with the full text
          one hover away — Khoa found titles wrapped to three lines in a narrow
          column, which is what made the table hard to scan. */}
      <td className="wb-list-cell-title">
        <CardEdge epic={epic} board={board} showBoard={!single} />
        <button type="button" className="wb-list-title" title={c.title} onClick={() => onOpen(c)}>
          {c.title}
        </button>
        {!single && board && <span className="wb-list-sub">{board.name}</span>}
      </td>
      {!single && (
        <td>
          <WorkboardListEdit
            canEdit={canEdit}
            saving={saving}
            label={`Client ${clientName}. Change`}
            text={clientName}
            control={(close) => (
              <select
                className="wb-list-control"
                value={c.board_id ?? ""}
                disabled={saving}
                aria-label="Client"
                autoFocus
                {...closeHandlers(close)}
                onChange={(e) => {
                  onBoard(e.target.value);
                  close();
                }}
              >
                {boardOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {boardLabel(b)}
                  </option>
                ))}
              </select>
            )}
          />
        </td>
      )}
      <td>
        {canEdit ? (
          // The board's own assignee swap, unchanged: avatar plus name at
          // rest, a native select on click (W.93). One component means the
          // List and the Board cannot drift on who a card is assigned to.
          <WorkboardQuickAssignee
            assigneeId={c.assignee_id}
            assigneeName={c.assignee_name}
            people={people}
            saving={saving}
            onAssignee={onAssignee}
          />
        ) : (
          <span className="admin-kanban-card-assignee">
            {c.assignee_name ? (
              <>
                <span className="admin-avatar admin-avatar--sm admin-avatar--soft">{initials(c.assignee_name)}</span>
                {c.assignee_name}
              </>
            ) : (
              <ListDash />
            )}
          </span>
        )}
      </td>
      <td className={`wb-list-pri${facts.highPriority ? " is-high" : ""}`}>{PRIORITY_LABEL[c.priority]}</td>
      <td>
        {/* The sprint reads as its identifier, not its theme (W.103.2): a full
            name is a sentence and it was stretching this column. */}
        {canEdit && sprints.length > 0 ? (
          <WorkboardListEdit
            canEdit
            saving={saving}
            label={`Sprint ${sprintFull ?? "none"}. Change`}
            title={sprintFull ?? undefined}
            text={sprintFull ? shortSprintName(sprintFull) : <ListDash />}
            control={(close) => (
              <select
                className="wb-list-control"
                value={c.sprint_id ?? ""}
                disabled={saving}
                aria-label="Sprint"
                autoFocus
                {...closeHandlers(close)}
                onChange={(e) => {
                  onSprint(e.target.value || null);
                  close();
                }}
              >
                <option value="">Backlog</option>
                {sprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.status === "closed" ? " (closed)" : ""}
                  </option>
                ))}
              </select>
            )}
          />
        ) : sprintFull ? (
          <span title={sprintFull}>{shortSprintName(sprintFull)}</span>
        ) : (
          <ListDash />
        )}
      </td>
      <td className="wb-list-num">
        <WorkboardListEdit
          canEdit={canEdit && !tokensDerived}
          saving={saving}
          label={`Human Tokens ${c.human_tokens ?? "none"}. Change`}
          text={c.human_tokens ?? <ListDash />}
          control={(close) => (
            <input
              className="wb-list-control wb-list-num"
              type="number"
              min={0}
              step={0.05}
              aria-label="Human Tokens"
              defaultValue={c.human_tokens ?? ""}
              disabled={saving}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Escape") close();
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              // A number is typed rather than picked, so the commit is on the
              // way out; blur then closes the cell either way.
              onBlur={(e) => {
                onTokens(e.target.value);
                close();
              }}
            />
          )}
        />
      </td>
      <ListDue card={c} today={today} overdue={overdue} canEdit={canEdit} saving={saving} onDue={onDue} />
    </tr>
  );
}
