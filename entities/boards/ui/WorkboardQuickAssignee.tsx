"use client";

import { useState } from "react";
import type { BoardPerson } from "@/entities/boards/lib/data";
import { initials } from "@/entities/boards/lib/types";
import { FaceAvatar } from "./FaceAvatar";

/**
 * Who has this card, read as text and edited in place (W.30, quietened in
 * W.93).
 *
 * W.30 made the name a resident `<select>`, so every card on the board wore
 * select chrome whether or not anybody was about to reassign it. The fact is
 * read a hundred times for every time it is changed, so the resting state is
 * the text again — avatar and name, exactly what a surface without quick
 * actions draws — and the control appears for the one field that was clicked.
 *
 * Still a NATIVE select once it is open, for the reason W.30 gave and W.93
 * does not reopen: the column body scrolls, so a hand-rolled menu would be
 * clipped by the column it lives in while the browser draws a native picker
 * outside the page. And the drag library refuses a drag that begins on a form
 * control, which is why the swap happens on CLICK and never at rest: a card
 * covered in controls is a card you cannot pick up.
 */
export function WorkboardQuickAssignee({
  assigneeId,
  assigneeName,
  people,
  saving,
  onAssignee,
  avatarOnly = false,
}: {
  assigneeId: string | null;
  assigneeName: string | null;
  people: BoardPerson[];
  saving: boolean;
  onAssignee: (personId: string | null) => void;
  /**
   * The card face draws the assignee as an avatar alone, at the end of its one
   * meta line (W.160): the initials are the fact, the name is in the drawer
   * and in the button's accessible name. The List view keeps the name.
   */
  avatarOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing && avatarOnly) {
    return (
      <button
        type="button"
        className="wb-quick-text wb-face-avatar-btn"
        disabled={saving}
        title={assigneeName ?? "Unassigned"}
        aria-label={`Assigned to ${assigneeName ?? "nobody"}. Change`}
        onClick={() => setEditing(true)}
      >
        <FaceAvatar name={assigneeName} />
      </button>
    );
  }

  if (!editing) {
    return (
      <span className="admin-kanban-card-assignee">
        {assigneeName && <span className="admin-avatar admin-avatar--sm admin-avatar--soft">{initials(assigneeName)}</span>}
        <button
          type="button"
          className="wb-quick-text wb-quick-assignee-text"
          disabled={saving}
          aria-label={`Assigned to ${assigneeName ?? "nobody"}. Change`}
          onClick={() => setEditing(true)}
        >
          {assigneeName ?? "Unassigned"}
        </button>
      </span>
    );
  }

  return (
    <span className="admin-kanban-card-assignee">
      {assigneeName && <span className="admin-avatar admin-avatar--sm admin-avatar--soft">{initials(assigneeName)}</span>}
      <select
        className="wb-quick-control wb-quick-assignee"
        value={assigneeId ?? ""}
        disabled={saving}
        aria-label="Assigned to"
        autoFocus
        onChange={(e) => {
          onAssignee(e.target.value || null);
          setEditing(false);
        }}
        // Leaving without choosing puts the text back: nothing was changed,
        // so nothing should still look changeable.
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
        }}
      >
        <option value="">Unassigned</option>
        {/* Someone outside the staff list still holds this card; without
            their own option the select would silently read Unassigned. */}
        {assigneeId && !people.some((p) => p.id === assigneeId) && (
          <option value={assigneeId}>{assigneeName ?? "Current assignee"}</option>
        )}
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </span>
  );
}
