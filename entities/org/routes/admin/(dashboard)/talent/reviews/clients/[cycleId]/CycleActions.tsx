"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MayProp } from "@/kernel/identity/may-prop";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { addMemberAction, closeCycleAction } from "./owner-actions";

// The owner's actions on a whole client review cycle (CR.2.4): add someone
// who is not in it, and close it. Closing warns first with what is still
// unfinished (story 15), because it stops every link in the cycle. Each server
// action guards itself; `may` only hides what it would refuse (ADR 0014).

export function CycleActions({
  may,
  cycleId,
  closed,
  candidates,
  contacts,
  unreleased,
  membersWaiting,
  clientManagersWaiting,
}: {
  may: MayProp;
  cycleId: string;
  closed: boolean;
  /** Team members not yet in the cycle, to add. */
  candidates: { id: string; name: string }[];
  /** The client's contacts, to name the new member's client manager. */
  contacts: { id: string; name: string }[];
  /** Members still in the cycle whose review is not released. */
  unreleased: number;
  /** Members still to send their own part, in a review not yet released. */
  membersWaiting: number;
  /** Members whose client manager has not sent their part. */
  clientManagersWaiting: number;
}) {
  const router = useRouter();
  const [member, setMember] = useState("");
  const [manager, setManager] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!may["org.reviews"] || closed) return null;

  function add() {
    setError(null);
    startTransition(async () => {
      const r = await addMemberAction({ cycleId, teamMemberId: member, clientManagerPersonId: manager || null });
      if (!r.ok) setError(r.error);
      else {
        setMember("");
        setManager("");
        router.refresh();
      }
    });
  }

  // What closing would leave unfinished (story 15): it locks every part not
  // yet sent, the members' own as well as the client managers'.
  const warning = [
    unreleased > 0 ? `${unreleased} ${unreleased === 1 ? "review is" : "reviews are"} not released` : null,
    membersWaiting > 0 ? `${membersWaiting} ${membersWaiting === 1 ? "member has" : "members have"} not sent their own part` : null,
    clientManagersWaiting > 0
      ? `${clientManagersWaiting} ${clientManagersWaiting === 1 ? "client manager has" : "client managers have"} not sent their part`
      : null,
  ].filter(Boolean);

  return (
    <div className="admin-card u-mb-4 u-p-4">
      <div className="u-row u-gap-3 u-wrap">
        <label className="admin-field u-m-0">
          <span className="admin-label">Add someone</span>
          <select className="admin-input" value={member} onChange={(e) => setMember(e.target.value)}>
            <option value="">Choose a team member</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field u-m-0">
          <span className="admin-label">Their client manager</span>
          <select className="admin-input" value={manager} onChange={(e) => setManager(e.target.value)}>
            <option value="">None yet</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="admin-btn admin-btn--sm" disabled={pending || !member} onClick={add}>
          Add to the cycle
        </button>
        <span className="u-flex-1" />
        <ConfirmButton
          className="admin-btn admin-btn--sm admin-btn--danger"
          label="Close cycle…"
          title="Close this cycle?"
          body={
            warning.length > 0
              ? `${warning.join(", and ")}. Closing stops every link and locks every part not yet sent, so nobody can answer after it. Reviews that are ready can still be released.`
              : "Closing stops every link in the cycle. Reviews that are ready can still be released."
          }
          confirmLabel="Close the cycle"
          onConfirm={() => closeCycleAction({ cycleId })}
          onDone={() => router.refresh()}
        />
      </div>
      <p className="admin-hint u-mt-2 u-mb-0">Someone added is emailed that their review is open, as opening the cycle did.</p>
      {error && (
        <p className="admin-hint u-m-0" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
