"use client";

import { useState } from "react";
import { takeDownKudos } from "@/entities/team/lib/kudos-actions";
import type { MayProp } from "@/kernel/identity/may-prop";

// Take down a kudos you gave (TH.1.8). Asks once, inline, because a modal is a
// lot of ceremony for one line of thanks; the row is archived, never deleted.

export function KudosTakeDown({ id, may }: { id: string; may: MayProp }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    const r = await takeDownKudos(id);
    setBusy(false);
    if (!r.ok) setError(r.error);
    else setAsking(false);
  }

  if (!may["team.culture"]) return null;
  if (!asking) {
    return (
      <button type="button" className="th-kd-x" onClick={() => setAsking(true)}>
        Take down
      </button>
    );
  }
  return (
    <span className="th-kd-ask">
      <span>Take it down?</span>
      <button type="button" className="th-kd-x is-yes" disabled={busy} onClick={() => void confirm()}>
        {busy ? "Taking down…" : "Yes"}
      </button>
      <button type="button" className="th-kd-x" disabled={busy} onClick={() => setAsking(false)}>
        Keep it
      </button>
      {error && (
        <span className="th-kd-err" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
