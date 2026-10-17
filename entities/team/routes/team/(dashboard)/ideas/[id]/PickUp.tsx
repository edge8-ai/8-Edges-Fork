"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/kernel/ui/Icon";
import { pickUpSpark } from "../actions";

// "Picked up as" on one spark (ID.2.8). Picking up is a real write, a card on
// a board, so it lives here, beside the whole spark, never as a one-tap answer
// in the deck: the person sees what they are taking on, chooses the board, and
// presses one clearly named button.
//
// TH.4.6: a pick-up that wrote the card but not every later step (the sprint
// was locked) is a success with a note, never an error, because the card
// exists. With no board to put a card on, the section says how to get one.

// Who has the card, the column it sits in and on which board (W.186): the
// author sees the work moving without opening the board.
type Card = {
  title: string;
  href: string;
  shipped: boolean;
  who: string | null;
  initials: string;
  tone: number;
  column: string | null;
  board: string;
  landed: string | null;
};
type Board = { id: string; name: string };

export function PickUp({
  ideaId,
  author,
  isOwner,
  card,
  boards,
}: {
  ideaId: string;
  /** The spark's author by name; `isOwner` says the reader is them, so a sentence never reads "you hears". */
  author: string;
  isOwner: boolean;
  card: Card | null;
  boards: Board[];
}) {
  const [boardId, setBoardId] = useState(boards[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function pick() {
    if (busy || !boardId) return;
    setBusy(true);
    setError(null);
    const r = await pickUpSpark(ideaId, boardId);
    setBusy(false);
    if (!r.ok) setError(r.error);
    else setNote(r.note);
  }

  return (
    <section className="sparks-card sparks-pickup" aria-labelledby="pickup-h" aria-live="polite">
      <h2 id="pickup-h" className="sparks-h2">
        {card ? (card.shipped ? "Shipped" : "Picked up") : "Pick it up"}
      </h2>
      {card ? (
        <>
          <Link className={`sparks-pickup-card${card.shipped ? " is-shipped" : ""}`} href={card.href}>
            <span className={`sparks-avatar sparks-avatar--lg sparks-avatar--${card.tone}`} aria-hidden="true">
              {card.initials}
            </span>
            <span className="sparks-pickup-body">
              <span className="sparks-pickup-who">
                <strong>{card.who ?? "A teammate"}</strong>
                {card.shipped ? ` shipped it${card.landed ? ` · ${card.landed}` : ""}` : card.who === "You" ? " have it" : " has it"}
              </span>
              <strong className="sparks-pickup-title">{card.title}</strong>
              <span className="sparks-pickup-where">
                {card.column && <span className="sparks-pickup-col">{card.column}</span>}
                <span>on {card.board}</span>
                <span className="sparks-pickup-open">Open the card →</span>
              </span>
            </span>
          </Link>
          {note && (
            <p className="sparks-note" role="status">
              <Icon name="alert" />
              <span>{note}</span>
            </p>
          )}
          <p className="sparks-lede">
            {card.shipped
              ? `It landed, with ${isOwner ? "your" : `${author}'s`} name on the spark that started it.`
              : "It shows as Shipped here once the card is done."}
          </p>
        </>
      ) : boards.length === 0 ? (
        <>
          <p className="sparks-lede">
            Nobody has taken this on yet. You&apos;re not on a Workboard board, so there is nowhere to put the card. Ask whoever runs
            your team&apos;s board to add you, then come back and pick it up.
          </p>
          <Link className="sparks-link" href="/team/workboard">
            Open the Workboard →
          </Link>
        </>
      ) : (
        <>
          <p className="sparks-lede">
            Nobody has taken this on yet. Picking it up makes a card for you on the board you choose, linked to this spark
            {isOwner ? "." : `, and ${author} hears that you did.`}
          </p>
          <div className="sparks-pickup-row">
            <label className="sparks-sr" htmlFor="pickup-board">
              Board
            </label>
            <select id="pickup-board" className="sparks-select" value={boardId} onChange={(e) => setBoardId(e.target.value)}>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <button type="button" className="sparks-btn-blue" disabled={busy} onClick={() => void pick()}>
              {busy ? "Making the card…" : "Pick it up on the Workboard"}
            </button>
          </div>
        </>
      )}
      {error && (
        <div role="alert" className="sparks-deck-error">
          {error}
        </div>
      )}
    </section>
  );
}
