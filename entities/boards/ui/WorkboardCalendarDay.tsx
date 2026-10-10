"use client";

import type { CSSProperties } from "react";
import type { KanbanColumn } from "@/kernel/ui/KanbanBoard";
import { initials } from "@/entities/boards/lib/types";
import { formatTokens } from "@/entities/boards/lib/tokens";
import { clientLabel } from "@/entities/boards/lib/card-facts";
import type { EpicRow } from "@/entities/boards/lib/types";
import type { WorkboardBoard } from "@/entities/boards/lib/workboard";
import type { Card } from "./board-view-types";
import type { CalendarGroup } from "./workboard-calendar";
import { CardEdge } from "./WorkboardCardEdge";

// One section of the agenda (W.109): a day head, and the cards due that day.
//
// A ROW IS THE QUIET CARD ON ONE LINE (W.107). The board's card and this row
// carry the same facts in the same order and the same colours — the 3px
// categorical edge, the title, the client, the effort, the assignee, the lane
// as a filled badge — because they are two renderings of one card and a reader
// moving between the views should not have to relearn either. Nothing here
// invents a colour rule: the edge is `admin-kanban-card-edge` with the board's
// data attributes, and the badge is `wb-col-badge` taking the lane's accent
// through `--kanban-accent`, which is how kernel/ui/KanbanBoard hands a column
// its accent.
//
// Priority never gets a hue (W.48), so it is not on the row at all: the board
// carries it as weight and there is no weight to spend on one line. Overdue is
// the error token, and a done card is struck and muted — the two readings the
// playbook reserves those tokens for.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * "22 Sep" — the compact day a head prints.
 *
 * Built from the ISO string rather than through `Date#toLocaleDateString`,
 * which reads the machine's locale and timezone: the same two would make the
 * server's render and the browser's differ, which is the hydration trap
 * `formatDate` documents and W.105's timezone bug was.
 */
export function shortDay(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
}

/** The weekday name, read off the date-only string so no timezone can shift it. */
export function weekdayOf(iso: string): string {
  return WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];
}

export function WorkboardCalendarDay({
  group,
  boardById,
  epicById,
  laneById,
  showBoard,
  selected,
  onCardClick,
}: {
  group: CalendarGroup<Card>;
  boardById: Map<string, WorkboardBoard>;
  epicById: Map<string, EpicRow>;
  /** The lane's own column, for its label and its accent (workboard-grouping.ts). */
  laneById: Map<string, KanbanColumn>;
  /** Many boards in scope: the edge carries the client rather than the epic (W.41). */
  showBoard: boolean;
  /** The day picked on the month grid (or, for the overdue pile, a late day picked there). */
  selected: boolean;
  onCardClick: (card: Card) => void;
}) {
  return (
    <section
      className={`wb-cal-day${group.today ? " is-today" : ""}${group.past ? " is-past" : ""}${group.kind === "overdue" ? " is-overdue" : ""}${selected ? " is-selected" : ""}`}
      aria-label={group.kind === "overdue" ? "Overdue" : shortDay(group.iso!)}
      data-group={group.key}
    >
      <header className="wb-cal-dayhead">
        <b>{group.kind === "overdue" ? "Overdue" : `${group.today ? "Today · " : ""}${shortDay(group.iso!)}`}</b>
        {group.iso && <span className="wb-cal-weekdayname">{weekdayOf(group.iso)}</span>}
        {/* No count (W.175): the rows under the head are the count, and the
            month grid beside the pane already prints one per day. */}
      </header>
      {group.cards.map((c) => (
        <CalendarRow
          key={c.id}
          card={c}
          board={boardById.get(c.board_id ?? "")}
          epic={epicById.get(c.epic_id ?? "")}
          lane={laneById.get(c.laneId)}
          showBoard={showBoard}
          onClick={() => onCardClick(c)}
        />
      ))}
    </section>
  );
}

function CalendarRow({
  card: c,
  board,
  epic,
  lane,
  showBoard,
  onClick,
}: {
  card: Card;
  board: WorkboardBoard | undefined;
  epic: EpicRow | undefined;
  lane: KanbanColumn | undefined;
  showBoard: boolean;
  onClick: () => void;
}) {
  const done = c.status === "done";
  return (
    <button type="button" className={`wb-cal-row${done ? " is-done" : ""}`} onClick={onClick}>
      <CardEdge epic={epic} board={board} showBoard={showBoard} />
      {/* One line, clipped with an ellipsis, and the whole title in `title`:
          a wrapped title is what made every row a different height, and the
          full text has to stay reachable without opening the card (W.103.1). */}
      <span className="wb-cal-title" title={c.title}>
        {c.title}
      </span>
      {board && <span className="wb-cal-client">{clientLabel(board)}</span>}
      {/* On the 0.05 grid 1.25 HT is a real estimate, so the figure keeps its
          decimals rather than reporting a different piece of work. Effort by
          shape; it is never a duration (CLAUDE.md). */}
      {c.human_tokens != null && <span className="wb-cal-ht">{formatTokens(c.human_tokens)} HT</span>}
      {c.assignee_name && (
        <span className="admin-avatar admin-avatar--sm admin-avatar--soft" title={c.assignee_name}>
          {initials(c.assignee_name)}
        </span>
      )}
      {lane && (
        <span
          className="wb-col-badge"
          // The lane's accent, exactly as kernel/ui/KanbanBoard publishes it to
          // a column. A custom property rather than a colour: the rule that
          // paints the badge lives in the stylesheet and `check:tokens` still
          // sees no literal colour and no inline colour declaration here.
          style={lane.accent ? ({ "--kanban-accent": lane.accent } as CSSProperties) : undefined}
        >
          {lane.label}
        </span>
      )}
    </button>
  );
}
