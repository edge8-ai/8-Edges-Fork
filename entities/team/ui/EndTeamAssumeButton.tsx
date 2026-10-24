"use client";

import { useState, useTransition } from "react";
import type { MayProp } from "@/kernel/identity/may-prop";

// Ends a team assume session, then loads Settings → Assume in full: the Team
// and Admin views are separate root layouts, and a client-side move between
// them stalls. Used by the Team banner and the Settings → Assume card.
export function EndTeamAssumeButton({
  endTeamAssume,
  label,
  may,
}: {
  endTeamAssume: () => Promise<{ ok: boolean; error?: string }>;
  label: string;
  may: MayProp;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!may["team.assume"]) return null;
  return (
    <>
      <button
        type="button"
        className="admin-btn admin-btn--sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await endTeamAssume();
            if (res.ok) return window.location.assign(new URL("/admin/settings/assume", window.location.origin).href);
            setError(res.error ?? "Could not end the session.");
          })
        }
      >
        {pending ? "Ending…" : label}
      </button>
      {error && <span className="u-warn">{error}</span>}
    </>
  );
}
