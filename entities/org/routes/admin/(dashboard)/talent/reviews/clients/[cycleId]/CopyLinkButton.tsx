"use client";

import { useState, useTransition } from "react";
import type { MayProp } from "@/kernel/identity/may-prop";
import { timeAgo } from "@/kernel/ui/format";
import { markLinkCopiedAction } from "./actions";

// Copies one client manager's link and records when (CR.2.3). The copy happens
// first, inside the click, because a browser only lets a page write to the
// clipboard while the person's gesture is still live; the time is saved after.
// If the browser refuses, the link is shown so it can be copied by hand.
export function CopyLinkButton({
  may,
  reviewId,
  link,
  copiedAt,
  memberName,
}: {
  /** ADR 0014: the button shows only to a viewer who holds the action's atom. */
  may: MayProp;
  reviewId: string;
  link: string;
  copiedAt: string | null;
  memberName: string;
}) {
  const [copied, setCopied] = useState<string | null>(copiedAt);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [pending, startTransition] = useTransition();

  async function copy() {
    setError(null);
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      setManual(true);
      setError("Your browser did not allow copying. Select the link below and copy it.");
      return;
    }
    startTransition(async () => {
      const r = await markLinkCopiedAction({ reviewId });
      if (r.ok) setCopied(r.copiedAt);
      else setError(r.error);
    });
  }

  if (!may["org.reviews"]) return null;
  return (
    <div>
      <div className="u-row u-gap-2">
        <button
          type="button"
          className={`admin-btn admin-btn--sm${copied ? "" : " admin-btn--primary"}`}
          onClick={copy}
          disabled={pending}
          aria-label={`Copy the client manager's link for ${memberName}`}
        >
          {copied ? "Copy again" : "Copy link"}
        </button>
        <span className="admin-hint u-m-0" role="status">
          {error ?? (copied ? `Copied ${timeAgo(copied)}` : "Not copied yet")}
        </span>
      </div>
      {manual && <input className="admin-input u-mt-2" readOnly value={link} aria-label={`The client manager's link for ${memberName}`} onFocus={(e) => e.currentTarget.select()} />}
    </div>
  );
}
