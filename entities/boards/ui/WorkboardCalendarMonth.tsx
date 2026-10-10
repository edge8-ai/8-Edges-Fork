"use client";

import type { EpicRow } from "@/entities/boards/lib/types";
import type { WorkboardBoard } from "@/entities/boards/lib/workboard";
import type { Card } from "./board-view-types";
import { weekNumber, type CalendarCell } from "./workboard-calendar";
import { CardEdge } from "./WorkboardCardEdge";
import { shortDay } from "./WorkboardCalendarDay";

// The Calendar's month (W.175, replacing W.109's mini month).
//
// Khoa on the W.109 view: it repeated itself and left a tall empty column
// under a 260px mini month. On the first redesign, which took the month away
// for a row of week cells: "keep the calendar". Fable researched how ClickUp,
// Google Calendar, Notion and Asana pair a month with a list, and this is the
// direction Khoa chose: a REAL month — the cards on their days — beside a pane
// that lists every one of them in full (WorkboardCalendar.tsx).
//
// A DAY SHOWS UP TO THREE CARDS. A fourth would make the rows uneven, so a
// fuller day shows two and "+N more" as plain text, never a toggle: nothing on
// a Workboard surface folds (W.94), and the full list is always the pane
// beside the grid, which a click on the day scrolls to.
//
// Colour follows the card: the 3px edge is the card's own (client or epic,
// CardEdge), a late card's title is in the error ink and a finished one is
// struck. Below the width where the pane can sit beside the grid the chips
// give way to a count per day ("3 due", "2 late"), and the pane follows the
// grid as the page's list.

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** More than this many cards on a day and the cell shows one fewer, then "+N more". */
const CHIPS_PER_DAY = 3;

export function WorkboardCalendarMonth({
  period,
  cells,
  selectedIso,
  boardById,
  epicById,
  showBoard,
  onSelect,
}: {
  period: string;
  cells: CalendarCell<Card>[];
  /** The day the reader picked, outlined; the pane beside the grid shows it. */
  selectedIso: string | null;
  boardById: Map<string, WorkboardBoard>;
  epicById: Map<string, EpicRow>;
  /** Many boards in scope: the edge carries the client rather than the epic (W.41). */
  showBoard: boolean;
  onSelect: (cell: CalendarCell<Card>) => void;
}) {
  const weeks: CalendarCell<Card>[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div className="wb-cal-month" role="group" aria-label={`${period}, one cell per day`}>
      <div className="wb-cal-weekdays" aria-hidden="true">
        <span />
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      {weeks.map((week) => {
        const wk = weekNumber(week[0].iso);
        return (
          <div key={week[0].iso} className="wb-cal-week">
            {/* The ISO week, because a sprint is named by it ("2026-W41"). */}
            <span className={`wb-cal-weekno${week.some((c) => c.today) ? " is-now" : ""}`} title={`Week ${wk.slice(1)}`}>
              {wk}
            </span>
            {week.map((cell) => (
              <DayCell
                key={cell.iso}
                cell={cell}
                selected={cell.iso === selectedIso}
                boardById={boardById}
                epicById={epicById}
                showBoard={showBoard}
                onSelect={onSelect}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function DayCell({
  cell,
  selected,
  boardById,
  epicById,
  showBoard,
  onSelect,
}: {
  cell: CalendarCell<Card>;
  selected: boolean;
  boardById: Map<string, WorkboardBoard>;
  epicById: Map<string, EpicRow>;
  showBoard: boolean;
  onSelect: (cell: CalendarCell<Card>) => void;
}) {
  const n = cell.cards.length;
  const shown = n > CHIPS_PER_DAY ? cell.cards.slice(0, CHIPS_PER_DAY - 1) : cell.cards;
  const name = `${shortDay(cell.iso)}, ${n === 0 ? "nothing due" : `${n} ${cell.late ? "late" : "due"}`}`;
  return (
    <button
      type="button"
      className={`wb-cal-date${cell.outOfMonth ? " is-out" : ""}${cell.today ? " is-today" : ""}${selected ? " is-selected" : ""}`}
      aria-label={name}
      aria-pressed={selected}
      onClick={() => onSelect(cell)}
    >
      <span className="wb-cal-num">{cell.dayOfMonth}</span>
      {shown.map((c) => (
        <span
          key={c.id}
          className={`wb-cal-chip${c.status === "done" ? " is-done" : cell.late && c.status === "open" ? " is-late" : ""}`}
          title={c.title}
        >
          <CardEdge epic={epicById.get(c.epic_id ?? "")} board={boardById.get(c.board_id ?? "")} showBoard={showBoard} />
          {c.title}
        </span>
      ))}
      {n > CHIPS_PER_DAY && <span className="wb-cal-more">+{n - shown.length} more</span>}
      {n > 0 && <span className={`wb-cal-count${cell.late ? " is-late" : ""}`}>{n} {cell.late ? "late" : "due"}</span>}
    </button>
  );
}
