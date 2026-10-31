"use client";

import type { BoardDetail } from "@/entities/boards/lib/data";
import { SUBJECT_COMMITMENT } from "@/entities/boards/lib/types";
import type { Form } from "./board-view-types";
import { isDrawn, type PlanningField } from "./card-field-visibility";

// The card form's planning links on a client board: the roadmap item and the
// internal flag. Split out of CardDrawer (Q3). The sprint and the epic moved
// to the pills under the header (CardPills), where every card shows them.
export function CardPlanningFields({
  form,
  setForm,
  isClientBoard,
  backlogItems,
  backlogGroups,
  show,
}: {
  form: Form;
  setForm: (form: Form | null) => void;
  isClientBoard: boolean;
  backlogItems: BoardDetail["backlogItems"];
  backlogGroups: BoardDetail["backlogGroups"];
  /** Which fields to draw (W.142); every field when absent. */
  show?: ReadonlySet<PlanningField>;
}) {
  const drawn = (f: PlanningField) => isDrawn(show, f);
  const roadmapIsListed = backlogItems.some((b) => b.id === form.roadmapItemId);
  return (
    <>
      {isClientBoard && form.subjectType !== SUBJECT_COMMITMENT && (backlogItems.length > 0 || form.roadmapItemId) && drawn("roadmap") && (
        <div className="admin-field">
          <label className="admin-label">Roadmap item</label>
          <select
            className="admin-select"
            value={form.roadmapItemId}
            onChange={(e) => setForm({ ...form, roadmapItemId: e.target.value })}
          >
            <option value="">Not linked</option>
            {/* The card's own link when this view has no roadmap to list it
                from (the all-boards scope reads none), so it never shows as
                "Not linked" while it is linked (W.142). */}
            {form.roadmapItemId && !roadmapIsListed && <option value={form.roadmapItemId}>{form.subjectLabel ?? "Its roadmap item"}</option>}
            {backlogGroups.map((g) => {
              const items = backlogItems.filter((b) => b.group_key === g.key);
              if (!items.length) return null;
              return (
                <optgroup key={g.key} label={g.label}>
                  {items.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </optgroup>
              );
            })}
            {(() => {
              // Items whose group is archived or missing still need to be linkable.
              const known = new Set(backlogGroups.map((g) => g.key));
              const rest = backlogItems.filter((b) => !b.group_key || !known.has(b.group_key));
              if (!rest.length) return null;
              return (
                <optgroup label="Other">
                  {rest.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </optgroup>
              );
            })()}
          </select>
        </div>
      )}

      {isClientBoard && drawn("internal") && (
        <div className="admin-field">
          <label className="admin-label u-row">
            <input
              type="checkbox"
              checked={form.internal}
              onChange={(e) => setForm({ ...form, internal: e.target.checked })}
            />
            Internal (hidden from the client portal)
          </label>
        </div>
      )}
    </>
  );
}
