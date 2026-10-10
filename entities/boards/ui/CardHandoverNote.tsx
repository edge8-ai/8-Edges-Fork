"use client";

import type { BoardPerson } from "@/entities/boards/lib/data";
import type { Form } from "./board-view-types";

// The sentence that goes with a handover (W.60).
//
// Reassignment used to be silent: the new assignee got a DM saying they had
// been assigned "X" on the <board> board and nothing else, so the person
// RECEIVING the work got a title with no context and had to go and ask. This
// appears only at the moment a handover is actually happening and is never
// required — an empty line reassigns exactly as before. It is an invitation,
// not a gate.
//
// It sits directly under the header's assignee control, because that is where
// the handover was just made; nothing about it belongs three sections down.
export function CardHandoverNote({
  form,
  setForm,
  people,
  viewerPersonId,
}: {
  form: Form;
  setForm: (form: Form | null) => void;
  people: BoardPerson[];
  viewerPersonId: string | null;
}) {
  const changed = form.assigneeId !== form.origAssigneeId;
  const toSomeoneElse = form.assigneeId !== "" && form.assigneeId !== viewerPersonId;
  // Picking a card up yourself is not a handover: there is nobody to tell, no
  // DM goes out, and asking for a line of context would be asking someone to
  // write a note to themselves.
  if (!form.id || !changed || !toSomeoneElse) return null;
  const receiver = people.find((p) => p.id === form.assigneeId)?.name;

  return (
    <div className="admin-field wb-drawer-handover">
      <label className="admin-label">A line for {receiver ?? "them"} (optional)</label>
      <textarea
        className="admin-textarea"
        rows={2}
        placeholder="What they need to know to pick this up."
        value={form.handoverNote}
        onChange={(e) => setForm({ ...form, handoverNote: e.target.value })}
      />
      <p className="admin-hint">Saved as a comment on the card and included in the message they get.</p>
    </div>
  );
}
