"use client";

import { useOptimistic, useState } from "react";
import { saigonToday } from "@/kernel/config/dates";
import { cardFacts } from "@/entities/boards/lib/card-facts";
import type { Blocker, BoardCard, BoardPerson } from "@/entities/boards/lib/data";
import { addBlocker, resolveBlockersNaming, setBlockerAssignee, setBlockerCard, toggleBlocker } from "@/entities/boards/lib/blocker-actions";
import type { RunAction } from "./board-view-types";
import { useDraftFlag } from "./card-drawer-sections";
import { isDone } from "@/entities/boards/lib/card-stage";

/** The blockers as they read once one tick has landed: the box, and nothing else. */
export function withResolved(blockers: Blocker[], tick: { id: string; resolved: boolean }): Blocker[] {
  return blockers.map((b) => (b.id === tick.id ? { ...b, resolved: tick.resolved } : b));
}

// A card's blockers, in the card drawer. Works exactly like subtasks (BL-01):
// add a blocker, optionally tag it to a team member or a client contact, and
// mark it resolved. Split out alongside CardSubtasks; it owns the new-blocker
// input and the tag picker.
export function CardBlockers({
  card,
  slug,
  people,
  clientContacts,
  cardOptions,
  saving,
  run,
  readOnly = false,
  onOpenCard,
}: {
  card: BoardCard;
  slug: string;
  people: BoardPerson[];
  clientContacts: BoardPerson[];
  // The other cards on this board a blocker may name (W.56). Empty on a
  // surface that has none to offer, which simply leaves the picker out.
  cardOptions: { id: string; title: string }[];
  saving: boolean;
  run: RunAction;
  readOnly?: boolean;
  // Opens a named card in this same drawer. Absent on a surface that cannot
  // navigate between cards, and then the link reads as plain text.
  onOpenCard?: (taskId: string) => void;
}) {
  const [newBody, setNewBody] = useState("");
  useDraftFlag("blocker", newBody.trim() !== "");
  const [newAssignee, setNewAssignee] = useState("");
  const [newCard, setNewCard] = useState("");
  // A ticked box shows ticked at once (W.205), as a subtask's does (W.194). It
  // used to wait for the save and a re-render of the whole board, which read as
  // a box that ignored the click. useOptimistic falls back to the server's
  // blockers when the transition ends, so a refused tick puts the box back.
  const [blockers, showTick] = useOptimistic(card.blockers, withResolved);

  function add() {
    if (!newBody.trim()) return;
    run(() => addBlocker(card.id, newBody, newAssignee || null, slug, newCard || null), () => {
      setNewBody("");
      setNewAssignee("");
      setNewCard("");
    });
  }
  // The tick must be shown inside the transition `run` opens, and it is:
  // settleWrite calls the write before its first await.
  function toggle(id: string, resolved: boolean) {
    run(() => {
      showTick({ id, resolved });
      return toggleBlocker(id, resolved, slug);
    });
  }
  function retag(id: string, assigneeId: string) {
    run(() => setBlockerAssignee(id, assigneeId || null, slug));
  }

  // The tag picker: team members and client contacts in two labelled groups.
  const tagOptions = (
    <>
      <option value="">Untagged</option>
      {people.length > 0 && (
        <optgroup label="Team">
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </optgroup>
      )}
      {clientContacts.length > 0 && (
        <optgroup label="Client">
          {clientContacts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );

  function retarget(id: string, taskId: string) {
    run(() => setBlockerCard(id, taskId || null, slug));
  }

  const unresolved = cardFacts({ ...card, blockers }, { today: saigonToday() }).openBlockers;

  // The cards a blocker may name: this board's, minus this card, because a
  // card cannot be waiting on itself (the action refuses it too).
  const namable = cardOptions.filter((o) => o.id !== card.id);
  const cardPickerOptions = (
    <>
      <option value="">Not a card</option>
      {namable.map((o) => (
        <option key={o.id} value={o.id}>
          {o.title}
        </option>
      ))}
    </>
  );

  return (
    <div className="admin-field">
      <label className="admin-label">
        Blockers
        {blockers.length > 0 ? ` (${unresolved} open of ${blockers.length})` : ""}
      </label>
      {/* This card is what somebody ELSE is waiting on (W.56). Finishing it
          is strong evidence their blockers can go, but it is offered and
          never automatic: a card can be closed for reasons that leave the
          thing they were waiting for undone. */}
      {card.blocks > 0 && (
        <p className="admin-hint u-row u-gap-2">
          <span>
            ⛓ This card blocks {card.blocks} other{card.blocks === 1 ? "" : "s"}.
          </span>
          {!readOnly && isDone(card) && (
            <button type="button" className="admin-btn admin-btn--sm" disabled={saving} onClick={() => run(() => resolveBlockersNaming(card.id, slug))}>
              Resolve them
            </button>
          )}
        </p>
      )}
      {blockers.map((b) => (
        <div key={b.id} className="u-row u-py-1">
          <input
            type="checkbox"
            checked={b.resolved}
            onChange={(e) => toggle(b.id, e.target.checked)}
            disabled={saving}
            title={b.resolved ? "Resolved" : "Mark resolved"}
          />
          <span className={`u-grow${b.resolved ? " u-muted admin-subtask-title--done" : ""}`}>
            {b.body}
            {/* The named card, as a link into its own drawer. Free text still
                works and the link is optional — what it buys is that "waiting
                on the auth migration" can point at the card that IS it. */}
            {b.blocked_by &&
              (onOpenCard ? (
                <button type="button" className="admin-link-inline" onClick={() => onOpenCard(b.blocked_by!.id)}>
                  → {b.blocked_by.title}
                </button>
              ) : (
                <span className="admin-cell-muted u-sm"> → {b.blocked_by.title}</span>
              ))}
          </span>
          {namable.length > 0 && !readOnly && (
            <select
              className="admin-select u-w-160 u-shrink-none"
              value={b.blocked_by?.id ?? ""}
              onChange={(e) => retarget(b.id, e.target.value)}
              disabled={saving}
              title="Waiting on a card"
            >
              {cardPickerOptions}
            </select>
          )}
          <select
            className="admin-select u-w-160 u-shrink-none"
            value={b.assignee_id ?? ""}
            onChange={(e) => retag(b.id, e.target.value)}
            disabled={saving || readOnly}
            title="Tag someone"
          >
            {tagOptions}
          </select>
        </div>
      ))}
      {!readOnly && (
        <div className="u-row u-mt-2">
          <input
            className="admin-input"
            placeholder="Add a blocker…"
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <select
            className="admin-select u-w-160 u-shrink-none"
            value={newAssignee}
            onChange={(e) => setNewAssignee(e.target.value)}
            title="Tag someone (optional)"
          >
            {tagOptions}
          </select>
          {namable.length > 0 && (
            <select
              className="admin-select u-w-160 u-shrink-none"
              value={newCard}
              onChange={(e) => setNewCard(e.target.value)}
              title="Waiting on a card (optional)"
            >
              {cardPickerOptions}
            </select>
          )}
          <button className="admin-btn" onClick={add} disabled={saving || !newBody.trim()}>
            Add
          </button>
        </div>
      )}
    </div>
  );
}
