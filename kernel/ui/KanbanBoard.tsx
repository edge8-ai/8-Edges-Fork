"use client";

import { DragDropContext, Droppable, Draggable, type DropResult, type ResponderProvided } from "@hello-pangea/dnd";
import { Fragment } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Icon } from "./Icon";
import { useBoardViewport } from "./useBoardViewport";

// A column renders as one of the board's side-by-side lanes, or — with
// variant "strip" — as a full-width band under them, still a drop target in
// the same drag context. The strip exists because two columns can sit side by
// side and mean "pick one", while a third that CLOSES a card is a different
// kind of act and should not be one column further along the same gesture
// (sprint planning's Done this week, W.20).
export type KanbanColumn = { id: string; label: string; accent?: string; variant?: "strip" };
export type KanbanCardBase = { id: string; columnId: string };

// Generic optimistic kanban. The parent owns card state and reconciliation; this
// only reports moves via onMove. Reusable for inquiries (status) and deals (stage).
export function KanbanBoard<T extends KanbanCardBase>({
  columns,
  cards,
  onMove,
  onReorder,
  onCardClick,
  renderCard,
  columnFooter,
  cardClassName,
  disabled,
  isDragDisabled,
  isDropDisabled,
  dragHandle = false,
  columnClassName,
  renderColumnHead,
  columnCount,
  boardClassName,
  emptyLabel,
  cardSections,
  cardLabel,
  announceMove,
}: {
  columns: KanbanColumn[];
  cards: T[];
  onMove: (cardId: string, toColumnId: string, toIndex?: number) => void;
  // Fired on a same-column drag (card stays in its column, just changes rank).
  // Optional — boards that don't track a within-column order can omit it.
  onReorder?: (cardId: string, columnId: string, toIndex: number) => void;
  onCardClick?: (card: T) => void;
  renderCard: (card: T) => ReactNode;
  columnFooter?: (column: KanbanColumn, cards: T[]) => ReactNode;
  cardClassName?: (card: T) => string | undefined;
  // Parents set this while a move is being written so a second drag cannot
  // start mid-flight and land on state the server is about to replace.
  disabled?: boolean;
  // Per-card drag gate, for surfaces where the viewer may move only some cards
  // (a board member on the client hub moves their own cards, nobody else's).
  isDragDisabled?: (card: T) => boolean;
  // Per-column drop gate, for a board where only some destinations are closed.
  // A locked sprint (W.19) still accepts a card into Done — finishing work is
  // not changing what the week committed to — so the gate is per column rather
  // than the board-wide `disabled`.
  isDropDisabled?: (column: KanbanColumn) => boolean;
  // Drag by a visible grip rather than by the whole card. For cards whose
  // surface is mostly buttons and inputs (the coaching board: a title you
  // click to reword, a why-it-is-stuck field, a move menu), the library
  // refuses a drag that starts on an interactive element, so a whole-card
  // handle leaves almost nothing to grab. The grip is the one place that is
  // always draggable, and it says so.
  dragHandle?: boolean;
  // A per-column class, for a header that reacts to what just happened in it.
  columnClassName?: (column: KanbanColumn) => string | undefined;
  // Replaces the dot-label-count header for one column. Returning null leaves
  // that column with the default head, so a board that passes nothing is
  // unchanged. A strip earns its own: "Done this week (3) — drop a card here
  // to close it" says what the drop does, which a bare label cannot. A column
  // with its own head draws its own count, so `columnCount` does not reach it.
  renderColumnHead?: (column: KanbanColumn, cards: T[]) => ReactNode | null;
  // What the column header counts, when the cards on screen are not the
  // answer. The Workboard holds the count still while a move is being written,
  // so a number that may yet be refused does not move first (W.49). Every
  // other board omits it and counts the cards it is drawing.
  columnCount?: (column: KanbanColumn, cards: T[]) => number;
  // A class on the board element itself, so a surface can style its own drag
  // without reaching every board that renders this one (W.16).
  boardClassName?: string;
  // What an empty column says; the default is the bare "No cards".
  emptyLabel?: (column: KanbanColumn) => string;
  // Optional headed sections inside one column's card list, for a column that
  // holds two different kinds of thing (sprint planning's Not done: the cards
  // carried out of last week, then the backlog behind them). The parent
  // returns the groups in the order they should read; a column it does not
  // section, and every board that passes nothing, renders exactly as before.
  // A group may withhold its cards — that is how a collapsed section shows a
  // heading and no draggables.
  cardSections?: (column: KanbanColumn, cards: T[]) => { key: string; heading: ReactNode; cards: T[] }[] | null;
  // ─── Moving a card without a mouse (W.65) ────────────────────────────────
  // The drag library already implements the keyboard pattern — space to lift,
  // arrows to move, space to drop, Esc to cancel — because the drag handle it
  // hands out is focusable. What it cannot supply is what a card IS and where
  // it went in this board's own words; its built-in announcements say "item
  // in position 2 of 5", which is true and tells a person nothing.
  //
  // Both are opt-in and both default to the library's own behaviour, so the
  // eight boards that pass neither are byte-for-byte the board they were.
  /** A card's name, for the label a screen reader reads before the lift. */
  cardLabel?: (card: T) => string;
  /**
   * What to say once the card has landed, in the board's own vocabulary. The
   * message is spoken through the library's live region, which is the one
   * that is already wired to the drag's lifecycle — a second live region of
   * our own would race it.
   */
  announceMove?: (cardId: string, toColumnId: string, sameColumn: boolean) => string;
}) {
  function handleDragEnd(result: DropResult, provided: ResponderProvided) {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    const sameColumn = destination.droppableId === source.droppableId;
    if (sameColumn && destination.index === source.index) return;
    // Announce before the handler: the move is optimistic, so by the time the
    // parent has re-rendered the library's live region has already closed.
    const said = announceMove?.(draggableId, destination.droppableId, sameColumn);
    if (said) provided.announce(said);
    if (sameColumn) {
      onReorder?.(draggableId, destination.droppableId, destination.index);
      return;
    }
    onMove(draggableId, destination.droppableId, destination.index);
  }

  function renderCardAt(card: T, index: number) {
    return (
      <Draggable draggableId={card.id} index={index} key={card.id} isDragDisabled={!!disabled || !!isDragDisabled?.(card)}>
        {(dp, ds) => (
          <div
            ref={dp.innerRef}
            {...dp.draggableProps}
            {...(dragHandle ? {} : dp.dragHandleProps)}
            className={`admin-kanban-card${ds.isDragging ? " is-dragging" : ""}${dragHandle && !isDragDisabled?.(card) ? " has-grip" : ""}${cardClassName?.(card) ? ` ${cardClassName(card)}` : ""}`}
            onClick={() => onCardClick?.(card)}
            // Only when the board has names for its cards (W.65). Without
            // these the element keeps the library's own labelling, which is
            // what every board that passes no `cardLabel` still gets.
            aria-label={cardLabel ? cardLabel(card) : undefined}
            aria-roledescription={cardLabel ? "Draggable card" : undefined}
          >
            {dragHandle && !isDragDisabled?.(card) && (
              <span
                className="admin-kanban-grip"
                {...dp.dragHandleProps}
                aria-label="Drag to move"
                title="Drag to move"
              >
                {/* The braille-dots glyph this was came from a symbol font, so
                    its weight and baseline were the platform's rather than the
                    admin's (W.103.3). */}
                <Icon name="grip" />
              </span>
            )}
            <div className="admin-kanban-card-inner">{renderCard(card)}</div>
          </div>
        )}
      </Draggable>
    );
  }

  // The draggable index counts across the whole column, not per section: the
  // library numbers a droppable's children, and a heading between two cards is
  // not one of them.
  function renderColumnCards(col: KanbanColumn, colCards: T[]) {
    const groups = cardSections?.(col, colCards) ?? [{ key: col.id, heading: null, cards: colCards }];
    let index = 0;
    return groups.map((g) => (
      <Fragment key={g.key}>
        {g.heading !== null && <div className="admin-kanban-col-section">{g.heading}</div>}
        {g.cards.map((card) => renderCardAt(card, index++))}
      </Fragment>
    ));
  }

  function renderColumn(col: KanbanColumn) {
    const colCards = cards.filter((c) => c.columnId === col.id);
    const head = renderColumnHead?.(col, colCards) ?? null;
    return (
            <Droppable droppableId={col.id} key={col.id} isDropDisabled={!!disabled || !!isDropDisabled?.(col)}>
              {(provided, snapshot) => (
                <div
                  className={`admin-kanban-col${col.variant === "strip" ? " admin-kanban-col--strip" : ""}${snapshot.isDraggingOver ? " is-over" : ""}${columnClassName?.(col) ? ` ${columnClassName(col)}` : ""}`}
                  // The column's accent, for the styles that paint the column
                  // itself rather than its dot. Colour belongs to the column,
                  // never to the cards inside it (the colour hierarchy in
                  // docs/engineering/admin-consistency-playbook.md).
                  //
                  // The width rides along deliberately. A board that passes no
                  // accent — Deals, Applications, JobReq, the coaching
                  // commitment board — has nothing to say with a coloured rail,
                  // and CSS cannot ask whether a custom property is set. So the
                  // accented columns publish a 3px width and the rest fall
                  // through to the 1px border they always had.
                  style={col.accent ? ({ "--kanban-accent": col.accent, "--kanban-accent-width": "3px" } as CSSProperties) : undefined}
                >
                  <div className="admin-kanban-col-head">
                    {head ?? (
                      <>
                        <span
                          className="admin-kanban-col-dot"
                          style={col.accent ? { background: col.accent } : undefined}
                        />
                        <span className="admin-kanban-col-label">{col.label}</span>
                        {/* Held still while a move is being written, when the
                            board says so (W.49): a number that may yet be
                            refused should not move first. */}
                        <span className="admin-kanban-col-count">{columnCount?.(col, colCards) ?? colCards.length}</span>
                      </>
                    )}
                  </div>
                  {/* Droppable ref lives on the card list (not the whole column)
                      so the placeholder sizes it — this keeps an empty column a
                      full-height drop target instead of collapsing to nothing. */}
                  <div className="admin-kanban-col-body" ref={provided.innerRef} {...provided.droppableProps}>
                    {colCards.length === 0 && !snapshot.isDraggingOver && (
                      <div className="admin-kanban-col-empty">{emptyLabel?.(col) ?? "No cards"}</div>
                    )}
                    {renderColumnCards(col, colCards)}
                    {provided.placeholder}
                  </div>
                  {columnFooter?.(col, colCards)}
                </div>
              )}
            </Droppable>
    );
  }

  const lanes = columns.filter((c) => c.variant !== "strip");
  const strips = columns.filter((c) => c.variant === "strip");
  // Every board that draws lanes gets the measured height, not only the
  // Workboard: the stylesheet's `calc(100vh - var(--wb-board-top))` is on
  // .admin-kanban-col, which all nine surfaces render (W.104.5).
  const boardRef = useBoardViewport();
  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div ref={boardRef} className={`admin-kanban${boardClassName ? ` ${boardClassName}` : ""}`}>
        {lanes.map(renderColumn)}
      </div>
      {strips.map(renderColumn)}
    </DragDropContext>
  );
}
