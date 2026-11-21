"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MayProp } from "@/kernel/identity/may-prop";
import { setDueDateAction } from "./due-date-actions";

// The cycle's due date in "Where it stands" (CR.5.7): set it, move it, or
// clear it. A new date saves with its own button rather than on every change,
// because a typed date passes through odd years on its way (0002, 0020).
// After a save the page reloads its words: the members' reminder (CR.5.5) and
// the email card's reminder line both follow the date. Without the
// permission, or on a closed cycle, the date is only shown.
export function DueDateField({
  may,
  cycleId,
  closed,
  dueDate,
  dueLabel,
  today,
}: {
  may: MayProp;
  cycleId: string;
  closed: boolean;
  dueDate: string | null;
  /** "Fri 4 Dec", written on the server from a fixed month list. */
  dueLabel: string | null;
  /** The first day a due date may be: Saigon's today, as the command checks it. */
  today: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(dueDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(next: string | null) {
    setError(null);
    startTransition(async () => {
      const r = await setDueDateAction({ cycleId, dueDate: next });
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  }

  if (!may["org.reviews"] || closed) {
    return <p className="admin-hint u-mt-3 u-mb-0">{dueLabel ? `Due ${dueLabel}.` : "No due date."}</p>;
  }
  return (
    <div className="u-mt-3">
      <div className="u-row u-gap-2 u-wrap u-items-end">
        <label className="admin-field u-m-0">
          <span className="admin-label">Due date (optional)</span>
          <input type="date" className="admin-input" value={value} min={today} disabled={pending} onChange={(e) => setValue(e.target.value)} />
        </label>
        {value && value !== (dueDate ?? "") && (
          <button type="button" className="admin-btn admin-btn--sm admin-btn--primary" disabled={pending} onClick={() => save(value)}>
            {dueDate ? "Save the new date" : "Save the due date"}
          </button>
        )}
        {dueDate && (
          <button
            type="button"
            className="admin-btn admin-btn--sm"
            disabled={pending}
            onClick={() => {
              setValue("");
              save(null);
            }}
          >
            No due date
          </button>
        )}
      </div>
      <p className="admin-hint u-mt-2 u-mb-0">
        {/* The date also ends the members' window to update what they sent (CR.6, member-update.ts canMemberUpdateSentPart). */}
        {dueDate
          ? "Members and client managers see it. A reminder goes 3 working days before, to members who have not sent theirs. Until the day ends, a member can update the answers they sent, unless their client manager has already sent theirs."
          : "No due date, so no reminders go. A member can update the answers they sent until their client manager sends theirs."}
      </p>
      {error && (
        <p className="admin-hint u-m-0" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
