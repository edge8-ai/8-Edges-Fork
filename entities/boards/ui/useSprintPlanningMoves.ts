"use client";

import { useState } from "react";
import { useServerSyncedState } from "@/kernel/ui/hooks/useServerSyncedState";
import type { CardMoveOutcome } from "@/entities/boards/lib/land-card";
import { SEND_TO_BACKLOG, isDonePlanningColumn, type PlanningBoard } from "@/entities/boards/lib/sprint-planning";
import type { WorkboardCard } from "@/entities/boards/lib/workboard";
import { bulkMessage, runBulk } from "./run-bulk";

export type PlanningCard = WorkboardCard & { columnId: string; pb: PlanningBoard };

// The two writes a planning move can make, passed in by the page so this file
// reaches no server action of its own (the page is where ADR 0014's list has it).
export type PlanningWrites = {
  setSprint: (cardId: string, sprintId: string | null, boardSlug: string) => Promise<CardMoveOutcome>;
  moveColumn: (cardId: string, columnId: string, boardSlug: string) => Promise<CardMoveOutcome>;
};

const VERB: Record<string, string> = { next: "Committed", open: "Took out", done: "Closed", [SEND_TO_BACKLOG]: "Sent to the backlog" };

// Every move on the planning page, one card or a selection (W.202): the arrow,
// a drop, and the selection bar's three verbs all come through `apply`, so a
// refusal reads the same wherever it started. Several cards run one after
// another through runBulk, the board's one way of applying a verb to many
// cards, and a refusal of one is said rather than swallowed.
//
// A card sent to the backlog stays in the Not done column, so the placement
// cannot tell the page it moved; `sent` is the cards it has just taken out of
// their sprint, which the page reads as sprint-less until the server says so.
export function useSprintPlanningMoves({
  serverPlacement,
  setBanner,
  writes,
}: {
  serverPlacement: Record<string, string>;
  setBanner: (message: string | null) => void;
  writes: PlanningWrites;
}) {
  const [placement, setPlacement, { pending, run }] = useServerSyncedState(serverPlacement);
  const [sent, setSent] = useState<ReadonlySet<string>>(new Set());

  // The write a move makes, or the sentence that says why it cannot be made.
  function writeFor(card: PlanningCard, to: string): (() => Promise<CardMoveOutcome>) | string {
    const { board, next } = card.pb;
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

  // Send carried cards to the backlog (W.207.3): the same write as taking a
  // card out of the next sprint, on cards that never reached it. A card that
  // has no sprint is already backlog and is not asked about.
  function sendToBacklog(ids: string[], cards: PlanningCard[]) {
    const byId = new Map(cards.map((c) => [c.id, c]));
    const targets = ids.flatMap((id) => {
      const card = byId.get(id);
      return card && card.columnId === "open" && card.sprint_id && !sent.has(id) ? [card] : [];
    });
    if (targets.length === 0) return;
    setSent((s) => new Set([...s, ...targets.map((c) => c.id)]));
    setBanner(null);
    void run(
      async () => {
        const outcome = await runBulk(
          targets.map((c) => c.id),
          async (id) => {
            const card = byId.get(id)!;
            const r = await writes.setSprint(id, null, card.pb.board.slug);
            // A refused card is carried again; the server's page says which.
            if (!r.ok) setSent((s) => new Set([...s].filter((x) => x !== id)));
            return r;
          },
        );
        const message = targets.length === 1 ? outcome.failures[0] : bulkMessage(outcome, VERB[SEND_TO_BACKLOG]);
        return message ? { ok: false as const, error: message } : { ok: true as const };
      },
      { onError: (message) => setBanner(targets.length === 1 ? `Couldn't move card: ${message}` : message) },
    );
  }

  function apply(ids: string[], to: string, cards: PlanningCard[]) {
    if (to === SEND_TO_BACKLOG) return sendToBacklog(ids, cards);
    const byId = new Map(cards.map((c) => [c.id, c]));
    const planned = ids.flatMap((id) => {
      const card = byId.get(id);
      return card && card.columnId !== to ? [{ card, write: writeFor(card, to) }] : [];
    });
    const movable = planned.filter((p) => typeof p.write !== "string");
    // Nothing can move: say why, and ask the server nothing.
    if (movable.length === 0) return setBanner(planned.map((p) => p.write).find((w) => typeof w === "string") ?? null);

    setPlacement((p) => ({ ...p, ...Object.fromEntries(movable.map((m) => [m.card.id, to])) }));
    setBanner(null);

    void run(
      async () => {
        const outcome = await runBulk(
          planned.map((p) => p.card.id),
          async (id) => {
            const { write } = planned.find((p) => p.card.id === id)!;
            if (typeof write === "string") return { ok: false, error: write };
            return write();
          },
        );
        const message = planned.length === 1 ? outcome.failures[0] : bulkMessage(outcome, VERB[to] ?? "Moved");
        return message ? { ok: false as const, error: message } : { ok: true as const };
      },
      { onError: (message) => setBanner(planned.length === 1 ? `Couldn't move card: ${message}` : message) },
    );
  }

  return { placement, pending, apply, sent };
}
