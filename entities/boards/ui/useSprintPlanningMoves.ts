"use client";

import { useState } from "react";
import { useServerSyncedState } from "@/kernel/ui/hooks/useServerSyncedState";
import type { CardMoveOutcome } from "@/entities/boards/lib/land-card";
import { commitmentLocked, dueBeforeSprint, isDonePlanningColumn, type PlanningBoard } from "@/entities/boards/lib/sprint-planning";
import type { WorkboardCard } from "@/entities/boards/lib/workboard";
import { bulkMessage, runBulk } from "./run-bulk";

export type PlanningCard = WorkboardCard & { columnId: string; pb: PlanningBoard };

// The two writes a planning move can make, passed in by the page so this file
// reaches no server action of its own (the page is where ADR 0014's list has it).
export type PlanningWrites = {
  setSprint: (cardId: string, sprintId: string | null, boardSlug: string) => Promise<CardMoveOutcome>;
  moveColumn: (cardId: string, columnId: string, boardSlug: string) => Promise<CardMoveOutcome>;
};

const VERB: Record<string, string> = { next: "Committed", open: "Took out", done: "Closed" };

// Every move on the planning page, one card or a selection (W.202): the arrow,
// a drop, and the selection bar's three verbs all come through `apply`, so a
// refusal reads the same wherever it started and the late-date offer (W.112)
// follows every commit exactly once. Several cards run one after another
// through runBulk, the board's one way of applying a verb to many cards, and a
// refusal of one is said rather than swallowed.
export function useSprintPlanningMoves({
  serverPlacement,
  today,
  setBanner,
  writes,
}: {
  serverPlacement: Record<string, string>;
  today: string;
  setBanner: (message: string | null) => void;
  writes: PlanningWrites;
}) {
  const [placement, setPlacement, { pending, run }] = useServerSyncedState(serverPlacement);
  // The cards each board's last commit made late for its sprint; replaced by its next.
  const [late, setLate] = useState<Record<string, PlanningCard[]>>({});

  // The write a move makes, or the sentence that says why it cannot be made.
  function writeFor(card: PlanningCard, to: string): (() => Promise<CardMoveOutcome>) | string {
    const { board, next } = card.pb;
    // The lock refuses changing what a sprint commits to, and only until the
    // sprint starts (W.202.2): the server's own rule. Closing a committed card
    // is not a change to the commitment, so Done stays open (W.19).
    if (next && commitmentLocked(card.pb, today) && (to === "next" || (card.columnId === "next" && !isDonePlanningColumn(to)))) {
      return `${next.name} is locked. Unlock it above to change what is committed.`;
    }
    // Reopening a card is a decision, not a leftward drag (W.20).
    if (isDonePlanningColumn(card.columnId)) return "Reopen this card from its drawer: click the card.";
    if (to === "next") {
      if (!next) return `${board.name} has no next sprint yet; the Monday routine opens one.`;
      // The server's own refusal (landInSprint), said without asking it (W.203).
      if (next.status === "closed") return `${next.name} is closed. Pick an open sprint.`;
      return () => writes.setSprint(card.id, next.id, board.slug);
    }
    if (isDonePlanningColumn(to)) {
      const col = board.columns.find((c) => c.is_done);
      if (!col) return `${board.name} has no done column.`;
      return () => writes.moveColumn(card.id, col.id, board.slug);
    }
    return () => writes.setSprint(card.id, null, board.slug);
  }

  function apply(ids: string[], to: string, cards: PlanningCard[]) {
    const byId = new Map(cards.map((c) => [c.id, c]));
    const planned = ids.flatMap((id) => {
      const card = byId.get(id);
      return card && card.columnId !== to ? [{ card, write: writeFor(card, to) }] : [];
    });
    const movable = planned.filter((p) => typeof p.write !== "string");
    // Nothing can move: say why, and ask the server nothing.
    if (movable.length === 0) return setBanner(planned.map((p) => p.write).find((w) => typeof w === "string") ?? null);

    const lateNow = new Set(to === "next" ? planned.filter((p) => dueBeforeSprint([p.card], p.card.pb.next).length > 0).map((p) => p.card.id) : []);
    if (to === "next") setLate((l) => ({ ...l, ...Object.fromEntries(planned.map((p) => [p.card.pb.board.id, []])) }));
    setPlacement((p) => ({ ...p, ...Object.fromEntries(movable.map((m) => [m.card.id, to])) }));
    setBanner(null);

    void run(
      async () => {
        const outcome = await runBulk(
          planned.map((p) => p.card.id),
          async (id) => {
            const { card, write } = planned.find((p) => p.card.id === id)!;
            if (typeof write === "string") return { ok: false, error: write };
            const r = await write();
            // Only a commit that held is offered a new date (W.133).
            if (r.ok && lateNow.has(id)) setLate((l) => ({ ...l, [card.pb.board.id]: [...(l[card.pb.board.id] ?? []), card] }));
            return r;
          },
        );
        const message = planned.length === 1 ? outcome.failures[0] : bulkMessage(outcome, VERB[to] ?? "Moved");
        return message ? { ok: false as const, error: message } : { ok: true as const };
      },
      { onError: (message) => setBanner(planned.length === 1 ? `Couldn't move card: ${message}` : message) },
    );
  }

  return { placement, pending, apply, late, closeLate: (boardId: string) => setLate((l) => ({ ...l, [boardId]: [] })) };
}
