"use client";

import { useState, useTransition } from "react";
import type { MayProp } from "@/kernel/identity/may-prop";

type Member = { personId: string; name: string; kind: string; contractor: boolean };

// "View as" opens the Team pages as that person sees them, in this tab, for 30
// minutes, read-only. The team entity owns the session and its server door
// builds the service-role client, so the action arrives as a prop.
export function TeamAssumeList({
  members,
  startTeamAssume,
  may,
}: {
  members: Member[];
  startTeamAssume: (personId: string) => Promise<{ ok: boolean; error?: string }>;
  may: MayProp;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  if (!may["team.assume"]) return null;

  function view(personId: string) {
    setError(null);
    setPendingId(personId);
    start(async () => {
      const res = await startTeamAssume(personId);
      // A full load: /team is another root layout, so a client-side move stalls.
      if (res.ok) return window.location.assign(new URL("/team", window.location.origin).href);
      setError(res.error ?? "Could not start the session.");
      setPendingId(null);
    });
  }

  return (
    <>
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      <div className="admin-list">
        {members.length === 0 ? (
          <div className="admin-empty">Nobody on the team has signed in yet.</div>
        ) : (
          members.map((m) => (
            <div key={m.personId} className="admin-list-row">
              <div className="admin-list-main">
                <div className="admin-list-title">{m.name}</div>
                <div className="admin-list-sub">{m.kind}</div>
              </div>
              <div className="admin-list-aside">
                <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={() => view(m.personId)}>
                  {pending && pendingId === m.personId ? "Opening…" : "View as"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
