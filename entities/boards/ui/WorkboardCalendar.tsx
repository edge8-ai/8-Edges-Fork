"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { saigonToday } from "@/kernel/config/dates";
import type { WorkboardData } from "@/entities/boards/lib/workboard";
import type { Card } from "./board-view-types";
import { buildCalendar, type CalendarCell } from "./workboard-calendar";
import { groupColumns, groupingVocabulary } from "./workboard-grouping";
import { WorkboardCalendarMonth } from "./WorkboardCalendarMonth";
import { WorkboardCalendarDay } from "./WorkboardCalendarDay";
import { chipDate } from "./card-chips";

// The Calendar view's frame (W.109, re-laid in W.175): the month, and beside
// it a pane listing every card the month shows. workboard-calendar.ts holds
// the model and the reasoning behind every rule; this file arranges what the
// model returned, keeps which day is picked, and resolves the three things a
// row prints that the model does not know about — board, epic and lane.
//
// THE PANE IS EXACTLY THE MONTH'S HEIGHT and scrolls inside itself (W.175).
// W.109 put a 260px mini month beside a long agenda, which left a tall empty
// column under the month for as far as the agenda ran. Now the grid sets the
// height of the row and the pane fills it, so neither column is longer than
// the other. Below the width where the two fit side by side the pane follows
// the grid as an ordinary list (the container query in admin.css).
//
// It is a ?view= param under the board page and not a route of its own (W.69),
// so the toolbar, the filters and the pulse strip above it belong to the board
// and are shared with Board and List.
export function WorkboardCalendar({
  data,
  cards,
  includeDone,
  monthShift,
  onShiftMonths,
  onCardClick,
  onShowUndated,
  onNewCardDue,
}: {
  data: WorkboardData;
  cards: Card[];
  /** The reader's lane filter names a done lane, so finished work is wanted here. */
  includeDone: boolean;
  /** How many whole months the agenda is from the one today sits in (W.109). */
  monthShift: number;
  onShiftMonths: (next: number) => void;
  onCardClick: (card: Card) => void;
  /**
   * Show the cards nobody has given a day (W.105).
   *
   * The Calendar says WHICH cards it means and nothing about how to show them,
   * exactly as the Schedule's undated line did. Which filters that becomes is
   * the board's decision, taken where every other filter is.
   */
  onShowUndated: () => void;
  /** Open a new card already due on a day the reader picked; absent where adding is not offered. */
  onNewCardDue?: (iso: string) => void;
}) {
  // The business calendar date, not the browser's: a due date is a Saigon day
  // (kernel/config/dates), and reading "today" off a laptop in another
  // timezone is how a card comes to look overdue a day early.
  const todayIso = saigonToday();
  const calendar = useMemo(
    () => buildCalendar({ cards, todayIso, monthShift, includeDone }),
    [cards, todayIso, monthShift, includeDone],
  );

  // Many boards in scope means the card's edge carries the CLIENT and one
  // board means it carries the epic — the same rule the board's own card
  // follows (W.41, CardEdge in WorkboardCardEdge.tsx), so the same colour means
  // the same thing in both views.
  const showBoard = data.boards.length > 1;
  const boardById = useMemo(() => new Map(data.boards.map((b) => [b.id, b])), [data.boards]);
  const epicById = useMemo(() => new Map(data.epics.map((e) => [e.id, e])), [data.epics]);
  // The lane's own accent, read from the one place that decides it
  // (workboard-grouping.ts), so the badge on a row is the badge on the column
  // the card sits in and the two can never drift.
  const lanes = useMemo(() => groupColumns("lane", [], groupingVocabulary(data)), [data]);
  const laneById = useMemo(() => new Map(lanes.map((l) => [l.id, l])), [lanes]);

  // The picked day belongs to the month it was picked in: paging to another
  // month drops it rather than outlining a day that is no longer on screen,
  // and the current month opens on today.
  const [picked, setPicked] = useState<{ shift: number; iso: string } | null>(null);
  const selectedIso = picked?.shift === monthShift ? picked.iso : monthShift === 0 ? todayIso : null;
  const selected = calendar.cells.find((c) => c.iso === selectedIso) ?? null;
  // A late day's open cards are not under its own date in the pane: they are
  // in the overdue pile, which only the current month has.
  const lateLands = selected?.late === true && monthShift === 0;
  const paneRef = useRef<HTMLDivElement>(null);

  // Paging starts the pane at its top, and Today means today: it clears the
  // pick rather than returning to whatever day was picked before paging away.
  function page(next: number) {
    if (next === 0) setPicked(null);
    paneRef.current?.scrollTo({ top: 0 });
    onShiftMonths(next);
  }

  // The section a pick should bring into view, scrolled to after the render
  // the pick causes (the effect below): measured before it, the offsets still
  // counted a "nothing due" strip about to go, or a month not yet drawn.
  const pendingScroll = useRef<string | null>(null);

  function select(cell: CalendarCell<Card>) {
    // A borrowed day from the neighbouring month pages there, where its cards
    // are listed — the navigator rule of a month view (Google Calendar's mini
    // month). Except a late day while this is the current month: its open
    // cards are in this month's overdue pile already.
    const stays = !cell.outOfMonth || (cell.late && monthShift === 0);
    const firstDay = calendar.cells.find((c) => !c.outOfMonth)?.iso ?? cell.iso;
    const shift = stays ? monthShift : monthShift + (cell.iso < firstDay ? -1 : 1);
    pendingScroll.current = cell.late && shift === 0 ? "overdue" : cell.iso;
    setPicked({ shift, iso: cell.iso });
    if (shift !== monthShift) onShiftMonths(shift);
  }

  useEffect(() => {
    const key = pendingScroll.current;
    const pane = paneRef.current;
    if (!key || !pane) return;
    pendingScroll.current = null;
    const target = pane.querySelector<HTMLElement>(`[data-group="${key}"]`);
    const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    // Beside the grid the pane scrolls itself (it is the target's offset
    // parent); under it, on a narrow screen, the page scrolls instead.
    if (pane.scrollHeight > pane.clientHeight) pane.scrollTo({ top: target ? target.offsetTop : 0, behavior });
    else (target ?? pane).scrollIntoView({ block: "start", behavior });
  }, [picked, monthShift]);

  return (
    <div className="wb-calendar">
      <div className="wb-cal-head">
        <h2 className="wb-cal-period">{calendar.period}</h2>
        <div className="wb-cal-nav">
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => page(monthShift - 1)} aria-label="Show the previous month">
            ‹
          </button>
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => page(0)} disabled={monthShift === 0}>
            Today
          </button>
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => page(monthShift + 1)} aria-label="Show the next month">
            ›
          </button>
        </div>
        {/* A card with no due date has no day to sit on, and inventing one
            would put work on a day nobody chose — so the head says how many
            there are and hands over to the filter that shows them (W.105).
            It moved here from under the old mini month in W.175. */}
        {calendar.summary.undated > 0 && (
          <button type="button" className="wb-cal-undated" onClick={onShowUndated}>
            <span className="wb-cal-undated-n">{calendar.summary.undated} undated · </span>
            Give them dates →
          </button>
        )}
      </div>
      <div className="wb-cal-body">
        <WorkboardCalendarMonth
          period={calendar.period}
          cells={calendar.cells}
          selectedIso={selectedIso}
          boardById={boardById}
          epicById={epicById}
          showBoard={showBoard}
          onSelect={select}
        />
        <div className="wb-cal-panewrap">
          {/* Focusable, because a region that scrolls must be reachable by
              keyboard to be scrolled at all. */}
          <div className="wb-cal-pane" ref={paneRef} role="region" aria-label="Cards due, by day" tabIndex={0}>
            {selected && selected.cards.length === 0 && (
              <div className="wb-cal-strip">
                <b>{chipDate(selected.iso)}</b>
                <span className="wb-cal-strip-q">nothing due</span>
                {onNewCardDue && (
                  <button type="button" className="wb-cal-undated" onClick={() => onNewCardDue(selected.iso)}>
                    New card due this day →
                  </button>
                )}
              </div>
            )}
            {calendar.groups.map((g) => (
              <WorkboardCalendarDay
                key={g.key}
                group={g}
                boardById={boardById}
                epicById={epicById}
                laneById={laneById}
                showBoard={showBoard}
                selected={g.kind === "overdue" ? lateLands : g.iso === selectedIso && !lateLands}
                onCardClick={onCardClick}
              />
            ))}
            {calendar.groups.length === 0 && (
              <p className="admin-empty">
                Nothing is due in {calendar.period}. Move the month, or widen the filters above.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
