"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/kernel/ui/format";
import { updateCard } from "@/entities/boards/lib/actions";
import { bulkMessage, runBulk } from "./run-bulk";

/**
 * The offer that follows committing a card already late for the sprint
 * (W.112). A card due before the sprint starts, committed as it is, is red on
 * the board from the first morning, which says nothing anybody chose.
 *
 * So this OFFERS, the way the weekend note does (W.68): the sprint's first
 * day or its last, or keep the date. Nothing is rewritten unless a button is
 * pressed, and Keep simply closes the offer. It appears once per commit — the
 * panel replaces it on the next one — and writes through updateCard, the same
 * action the drawer saves with, so the audit and the checks are the drawer's.
 *
 * Several cards are re-dated through runBulk (A.33), the board's one way of
 * applying a verb to many cards: a refusal no longer stops the others, and the
 * person reads one sentence about what refused. A write that landed
 * revalidated and came back with the page re-rendered, and a refused one
 * changed nothing, so the page is refreshed only when a request went
 * unanswered and may have landed with its response lost.
 */
export function SprintPlanningLateOffer({
  cards,
  sprint,
  boardSlug,
  onClose,
}: {
  cards: { id: string; title: string; due_date: string | null }[];
  sprint: { name: string; starts_on: string | null; ends_on: string | null };
  boardSlug: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = sprint.starts_on;
  if (cards.length === 0 || !start) return null;
  const one = cards.length === 1;

  // runBulk never rejects: a write that throws (a network drop, a server
  // error) reads as that card's refusal, so the buttons are always freed and
  // the reason is on screen (W.133).
  async function moveTo(date: string) {
    setBusy(true);
    setError(null);
    const outcome = await runBulk(cards.map((c) => c.id), (id) => updateCard(id, { dueDate: date }, boardSlug));
    if (outcome.unanswered > 0) router.refresh();
    setBusy(false);
    // One card's refusal is said as its reason; "1 refused:" in front of it
    // would count what nobody needs counted.
    const message = one ? outcome.failures[0] ?? null : bulkMessage(outcome, "Re-dated");
    if (message) setError(message);
    else onClose();
  }

  return (
    <div className="admin-sprint-panel-bulk" role="status">
      <span className="admin-hint u-m-0">
        {one
          ? `“${cards[0].title}” is due ${formatDate(cards[0].due_date ?? "")}, before ${sprint.name} starts.`
          : `${cards.length} cards just committed are due before ${sprint.name} starts.`}
      </span>
      <button type="button" className="admin-btn admin-btn--sm" disabled={busy} onClick={() => moveTo(start)}>
        Move to {formatDate(start)}
      </button>
      {sprint.ends_on && sprint.ends_on !== start && (
        <button type="button" className="admin-btn admin-btn--sm" disabled={busy} onClick={() => moveTo(sprint.ends_on!)}>
          Move to {formatDate(sprint.ends_on)}
        </button>
      )}
      <button type="button" className="admin-btn admin-btn--sm" disabled={busy} onClick={onClose}>
        Keep {one ? "the date" : "the dates"}
      </button>
      {error && <span className="u-err u-sm">{error}</span>}
    </div>
  );
}
