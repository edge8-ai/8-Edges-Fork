"use client";

import { useState, useTransition } from "react";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import type { RosterCandidate } from "@/entities/coaching/lib/data/roster";
import { addToRoster } from "@/entities/coaching/lib/actions";

// Add a team member to the actor's own coaching roster. Since K.46 it is one
// small button in the page head that opens the form in a drawer, because the
// roster page is read before a 1-1 and a permanent form at the foot of it
// competed with the people on it for attention. The biweekly explanation moves
// into the drawer with the form: it is what someone needs while picking the
// first date, and noise at every other moment.
export function AddToRoster({ candidates }: { candidates: RosterCandidate[] }) {
  const [open, setOpen] = useState(false);
  const [teamMemberId, setTeamMemberId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  if (candidates.length === 0) return null;

  const submit = () => {
    setError(null);
    startTransition(async () => {
      // No date here on purpose: a day the coach types at add time is not a 1-1
      // the member agreed to, and two such rows read as "First 1-1 on 30 Sep"
      // for a fortnight nobody had picked (Khoa, 2026-09-17). The first date is
      // proposed from the row and answered by the member (K.32).
      const res = await addToRoster(teamMemberId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTeamMemberId("");
      setOpen(false);
    });
  };

  return (
    <>
      <button type="button" className="admin-btn admin-btn--sm" onClick={() => setOpen(true)}>
        + Add someone
      </button>
      <DetailDrawer
        open={open}
        onClose={() => setOpen(false)}
        eyebrow="Your roster"
        title="Add someone you coach"
      >
        <p className="admin-hint">
          Pick a person. Their first 1-1 is proposed from their row and answered by them; the
          biweekly cadence starts from the day you both settle on.
        </p>
        {error && <div className="admin-alert admin-alert--err">{error}</div>}
        <div className="coach-roster-add">
          <label className="admin-label" htmlFor="coach-roster-add-person">
            Person
          </label>
          <select
            id="coach-roster-add-person"
            className="admin-input"
            value={teamMemberId}
            onChange={(e) => setTeamMemberId(e.target.value)}
          >
            <option value="">Choose a team member…</option>
            {candidates.map((c) => (
              <option key={c.teamMemberId} value={c.teamMemberId}>
                {c.name}
                {c.positionTitle ? ` (${c.positionTitle})` : ""}
              </option>
            ))}
          </select>
          <button
            className="admin-btn admin-btn--primary"
            disabled={busy || !teamMemberId}
            onClick={submit}
          >
            {busy ? "Adding…" : "Add to roster"}
          </button>
        </div>
      </DetailDrawer>
    </>
  );
}
