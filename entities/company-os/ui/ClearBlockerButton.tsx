"use client";

// "Cleared" beside a blocker that waits on the reader (AH.7.2), so the one red
// reason the reader can settle alone is settled on Client Hubs, the way
// Revenue today closes a deal in place (RT.1). The route hands the boards
// action in; it checks the reader may change that board itself.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Result } from "@/kernel/data/result";

export type ClearBlocker = (blockerId: string, resolved: boolean, boardSlug: string) => Promise<Result>;

export function ClearBlockerButton({ blockerId, boardSlug, clear }: { blockerId: string; boardSlug: string; clear: ClearBlocker }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      {" "}
      <button
        type="button"
        className="admin-btn admin-btn--sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await clear(blockerId, true, boardSlug);
            if (r.ok) router.refresh();
            else setError(r.error);
          })
        }
      >
        {pending ? "Clearing…" : "Cleared"}
      </button>
      {error && <span className="admin-cell-muted"> {error}</span>}
    </>
  );
}
