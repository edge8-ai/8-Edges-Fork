"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SUBJECT_CONTRACTOR_WORK, type HoursReport, type MoveCard, type ReportHours } from "@/entities/boards/lib/types";
import type { WorkboardBoard, WorkboardData } from "@/entities/boards/lib/workboard";
import type { SyncedRun } from "@/kernel/ui/hooks/useServerSyncedState";
import { reorderCard } from "@/entities/boards/lib/reorder-actions";
import type { Card } from "./board-view-types";
import { showMoveUndo } from "./undo-toast";

/** A move the server has not answered yet: the lane the card left, the lane it is going to. */
export type PendingMove = { from: string; to: string };

/**
 * What the board draws about a move that is in flight or that failed (W.49),
 * and about one that just landed (W.16). It is one object rather than five
 * separate props because Workboard only forwards it — the picture belongs to
 * WorkboardKanban.
 */
export type WorkboardMoveState = {
  /** Card id → the move being written. Empty when nothing is in flight. */
  pending: Record<string, PendingMove>;
  /** Card id → what the server said, and the lane the move was aiming at. */
  failures: Record<string, { message: string; laneId: string }>;
  /** The lane a move just landed in, for one beat of its count. */
  landedLane: string | null;
  /**
   * The card THIS person just finished, for one beat (W.67).
   *
   * Finishing a card is the best moment on the board and it rendered as a row
   * sliding quietly to the right. So the card gets a brief flourish — and
   * that is the whole of it. It is a response to your own action: it is set
   * by the hook that ran the move, in the browser that ran it, so nobody
   * else's board plays it and a refresh does not replay it. Nothing is
   * stored, nothing is counted, there is no streak and no total. That is the
   * only kind of gamification this company ships.
   */
  completedCard: string | null;
  /** Run the failed move again, from the card. */
  retry: (cardId: string) => void;
  /** Take the message off the card without retrying. */
  dismiss: (cardId: string) => void;
};

/**
 * Whether a move must first ask for hours: a contractor work request's card,
 * going into Done, moved by the contractor it is assigned to.
 */
export function asksForHours(
  card: { subject_type: string | null; assignee_id: string | null },
  intoDone: boolean,
  viewerPersonId: string | null,
): boolean {
  return intoDone && card.subject_type === SUBJECT_CONTRACTOR_WORK && card.assignee_id !== null && card.assignee_id === viewerPersonId;
}

/** How long the landed lane keeps its class; the keyframe itself is 300ms. */
const LANDED_MS = 400;
/** How long a just-completed card keeps its class; the keyframe is 520ms (W.67). */
const COMPLETED_MS = 650;

// The board view's two drags, split out of Workboard.tsx for the file-size gate.
// `move` is a cross-lane drag (delegates to the injected onMove); `reorder` is a
// within-lane drag for priority (RE-01), persisted through reorderCard. It also
// owns the optimistic within-lane order overrides and the ordered card list the
// KanbanBoard renders: lanes keep their group order, and within a reordered lane
// cards follow the override (unlisted cards fall after, in original order).
export function useWorkboardDrag({
  data,
  cards,
  boardById,
  single,
  onMove,
  placement,
  setPlacement,
  run,
  setBanner,
  onReportHours,
  viewerPersonId,
}: {
  data: WorkboardData;
  cards: Card[];
  boardById: Map<string, WorkboardBoard>;
  single: WorkboardBoard | null;
  onMove: MoveCard;
  /** The lane every card is drawn in right now, server value plus overrides. */
  placement: Record<string, string>;
  setPlacement: (fn: (p: Record<string, string>) => Record<string, string>) => void;
  /** The board's synced write: in flight, settled, rolled back on a refusal. */
  run: SyncedRun;
  setBanner: (message: string | null) => void;
  onReportHours?: ReportHours;
  viewerPersonId: string | null;
}) {
  const [order, setOrder] = useState<Record<string, string[]>>({});
  useEffect(() => setOrder({}), [data.cards]);
  // A move is in flight until the server answers, and a card whose move failed
  // keeps its message until it is retried or dismissed — not until the next
  // refresh, which is where the banner used to lose it (W.49).
  const [pending, setPending] = useState<Record<string, PendingMove>>({});
  const [failures, setFailures] = useState<Record<string, { message: string; laneId: string }>>({});
  const [landedLane, setLandedLane] = useState<string | null>(null);
  const [completedCard, setCompletedCard] = useState<string | null>(null);
  const landedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (landedTimer.current) clearTimeout(landedTimer.current);
      if (completedTimer.current) clearTimeout(completedTimer.current);
    },
    [],
  );
  const laneById = useMemo(() => new Map(data.lanes.map((l) => [l.id, l])), [data.lanes]);

  const orderedCards = useMemo(() => {
    if (Object.keys(order).length === 0) return cards;
    const laneFirst = new Map<string, number>();
    cards.forEach((c, i) => {
      if (!laneFirst.has(c.columnId)) laneFirst.set(c.columnId, i);
    });
    return cards
      .map((c, i) => {
        const ids = order[c.columnId];
        const k = ids ? ids.indexOf(c.id) : -1;
        return { c, lane: laneFirst.get(c.columnId) ?? 0, rank: !ids ? i : k === -1 ? ids.length + i : k };
      })
      .sort((a, b) => a.lane - b.lane || a.rank - b.rank)
      .map((x) => x.c);
  }, [cards, order]);

  // The contractor card waiting on its hours before it may land in Done.
  const [hoursFor, setHoursFor] = useState<{ cardId: string; laneId: string } | null>(null);

  const land = useCallback(
    (cardId: string, laneId: string) => {
      const card = data.cards.find((c) => c.id === cardId);
      const board = card ? boardById.get(card.board_id ?? "") : undefined;
      const toColumnId = board?.laneColumn[laneId];
      if (!card || !board || !toColumnId) {
        // This one stays on the page banner deliberately. It is not a write
        // that failed — it is the board missing a column, so there is nothing
        // on the card to retry and an admin has to change the board. W.49's
        // rule is that the banner keeps what is not about one write.
        setBanner(`${board?.name ?? "That board"} has no "${laneId}" column.`);
        return;
      }
      // Where the card is drawn now, which on a retry is not its server lane.
      const from = placement[cardId] ?? card.laneId;
      setPlacement((p) => ({ ...p, [cardId]: laneId }));
      setBanner(null);
      setFailures(({ [cardId]: _cleared, ...rest }) => rest);
      setPending((p) => ({ ...p, [cardId]: { from, to: laneId } }));
      void run(() => onMove(cardId, toColumnId, board.slug), {
        // Only once the server has taken the move, which is why both of these
        // live here: the Undo can never be offered for a move that did not
        // happen (W.50), and the count pops when the number is true (W.16).
        onOk: () => {
          // The class comes off on a timer rather than on animationend,
          // because under prefers-reduced-motion there is no animation to end.
          setLandedLane(laneId);
          if (landedTimer.current) clearTimeout(landedTimer.current);
          landedTimer.current = setTimeout(() => setLandedLane(null), LANDED_MS);
          // Finishing a card is a different event from moving one (W.67), and
          // it is only this one when the lane the card reached is a done
          // lane. Off the same `onOk` as the count pop, for the same reason:
          // a celebration for a move the server refused would be a lie.
          if (laneById.get(laneId)?.isDone) {
            setCompletedCard(cardId);
            if (completedTimer.current) clearTimeout(completedTimer.current);
            completedTimer.current = setTimeout(() => setCompletedCard(null), COMPLETED_MS);
          }
          showMoveUndo({
            cardId,
            title: card.title,
            destination: laneById.get(laneId)?.name ?? laneId,
            slug: board.slug,
            kind: "column",
            // Drop this card's optimistic lane rather than guessing a new one:
            // the undo landed wherever the stage log said, and the board the
            // undo action re-rendered in its response is what knows where
            // that was (W.196); nothing is in flight, so it is adopted as is.
            onUndone: () => {
              setPlacement((p) => {
                const next = { ...p };
                delete next[cardId];
                return next;
              });
            },
          });
        },
        // The message goes on the card, where the person is looking, and the
        // optimistic placement goes back to the lane the card came from — so
        // the card returns to its real column now rather than a refresh later.
        onError: (message) => {
          setFailures((f) => ({ ...f, [cardId]: { message, laneId } }));
          setPlacement((p) => ({ ...p, [cardId]: from }));
        },
        // A move the server took came back with the board re-rendered, and the
        // release has already let the placement follow it (W.196); `run` asks
        // the server again only for a refused or unanswered move.
      }).then(() => setPending(({ [cardId]: _settled, ...rest }) => rest));
    },
    [data.cards, boardById, laneById, placement, onMove, setPlacement, setBanner, run],
  );

  // Every lane move goes through here, so a drag, the drawer's column picker
  // and a keyboard move all ask. Only the contractor on the card is asked —
  // the hours are theirs to give — and only when the page can record them;
  // anyone else's move lands as any card's would.
  const move = useCallback(
    (cardId: string, laneId: string) => {
      const card = data.cards.find((c) => c.id === cardId);
      if (onReportHours && card && asksForHours(card, laneById.get(laneId)?.isDone ?? false, viewerPersonId)) {
        setHoursFor({ cardId, laneId });
        return;
      }
      land(cardId, laneId);
    },
    [data.cards, onReportHours, viewerPersonId, laneById, land],
  );

  const hoursPrompt = hoursFor && onReportHours
    ? {
        title: data.cards.find((c) => c.id === hoursFor.cardId)?.title ?? "This card",
        submit: async (report: HoursReport) => {
          const r = await onReportHours(hoursFor.cardId, report);
          if (r.ok) land(hoursFor.cardId, hoursFor.laneId);
          return r;
        },
        cancel: () => setHoursFor(null),
      }
    : null;

  const moveState: WorkboardMoveState = useMemo(
    () => ({
      pending,
      failures,
      landedLane,
      completedCard,
      retry: (cardId: string) => {
        const failed = failures[cardId];
        // land, not move: the hours were recorded before the move failed.
        if (failed) land(cardId, failed.laneId);
      },
      dismiss: (cardId: string) => setFailures(({ [cardId]: _dismissed, ...rest }) => rest),
    }),
    [pending, failures, landedLane, completedCard, land],
  );

  // Drag a card up or down within its own lane for priority. The Done lane is
  // auto-sorted newest-first, so a manual rank there is ignored.
  function reorder(cardId: string, laneId: string, toIndex: number) {
    if (laneById.get(laneId)?.isDone) return;
    const laneIds = orderedCards.filter((c) => c.columnId === laneId).map((c) => c.id);
    const from = laneIds.indexOf(cardId);
    if (from === -1 || from === toIndex) return;
    laneIds.splice(from, 1);
    laneIds.splice(toIndex, 0, cardId);
    setOrder((o) => ({ ...o, [laneId]: laneIds }));
    const card = data.cards.find((c) => c.id === cardId);
    const board = card ? boardById.get(card.board_id ?? "") : undefined;
    setBanner(null);
    void run(() => reorderCard(cardId, laneIds, board?.slug ?? single?.slug ?? ""), {
      // A reorder failure stays on the banner: a retry would send the lane
      // order this page held before the refresh replaced it, which is no
      // longer the order anybody is looking at.
      onError: (message) => setBanner(`Couldn't reorder card: ${message}`),
    });
  }

  return { orderedCards, move, reorder, moveState, hoursPrompt };
}
