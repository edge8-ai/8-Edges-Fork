"use client";

import type { Form } from "./board-view-types";
import { isDrawn, type PlanningField } from "./card-field-visibility";

// A short summary of what the card's pull request shipped. It lives as a loose
// key on tasks.metadata beside the PR link, and neither exists on a card that
// has not been created yet — there is nothing for a PR to point at. The link
// itself is the PR pill under the header (CardPills), where every card shows it.
export function CardPrFields({
  form,
  setForm,
  readOnly,
  show,
}: {
  form: Form;
  setForm: (form: Form | null) => void;
  readOnly: boolean;
  /** Which fields to draw (W.142); every field when absent. */
  show?: ReadonlySet<PlanningField>;
}) {
  if (!form.id) return null;
  const drawn = (f: PlanningField) => isDrawn(show, f);
  return (
    <>
      {(!readOnly || form.buildSummary) && drawn("build") && (
        <div className="admin-field">
          <label className="admin-label">Build summary</label>
          <textarea
            className="admin-textarea"
            rows={3}
            placeholder="A short summary of what this PR ships."
            value={form.buildSummary}
            onChange={(e) => setForm({ ...form, buildSummary: e.target.value })}
          />
        </div>
      )}
    </>
  );
}
