"use client";

import { useState, useTransition } from "react";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { runDailyCheckInNow } from "@/entities/company-os/lib/check-in/check-in-actions";

// Run now, on the check-in's own page. It posts to every team chat, so it asks
// first and then says exactly what happened rather than leaving the operator to
// go and look in Lark.
export function RunNowButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="u-row u-gap-3 u-items-center">
      <ConfirmButton
        label={pending ? "Running…" : "Run now"}
        className="admin-btn"
        disabled={pending}
        title="Run the check-in now"
        body="This reads the Workboard and posts today's check-in to the Product Team, EO and Operations chats. It sends nothing if today already has a post."
        confirmLabel="Run it"
        onConfirm={async () => {
          setMessage(null);
          setError(null);
          const result = await runDailyCheckInNow();
          if (result.ok) startTransition(() => setMessage(result.message));
          else setError(result.error);
          return result.ok ? { ok: true as const } : { ok: false as const, error: result.error };
        }}
      />
      {message && <span className="admin-cell-muted">{message}</span>}
      {error && <span className="u-err">{error}</span>}
    </div>
  );
}
