"use client";

import { useState, useTransition } from "react";
import type { MayProp } from "@/kernel/identity/may-prop";
import { timeAgo } from "@/kernel/ui/format";
import { managerLinkCopiedAction } from "./manager-link-actions";

// Copies a client manager's one link to the cycle and records when (CR.5.6),
// on the overview's links card (CR.5.7) and the member page's link row
// (CR.5.8). The copy happens first, inside the click, because a browser only
// lets a page write to the clipboard while the person's gesture is still
// live; the time is saved after. If the browser refuses, the link is shown so
// it can be copied by hand. The per-part links of CR.2.3 and their copy times
// are gone: one link per manager replaced them.
export function CopyLinkButton({
  may,
  manager,
  link,
  copiedAt,
  subject,
  idleNote,
  copiedNote,
}: {
  /** ADR 0014: the button shows only to a viewer who holds the action's atom. */
  may: MayProp;
  manager: { cycleId: string; clientManagerPersonId: string };
  link: string;
  copiedAt: string | null;
  /** Names the link for a screen reader, such as "Rosa Vega's link, for all 3 of their members". */
  subject: string;
  /** What to say before the first copy, in place of the default. */
  idleNote?: string;
  /** What to add after the copied time, for example that copying sends nothing. */
  copiedNote?: string;
}) {
  const [copied, setCopied] = useState<string | null>(copiedAt);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [pending, startTransition] = useTransition();
  const name = subject;

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
      const r = await managerLinkCopiedAction(manager);
      if (r.ok) setCopied(r.at);
      else setError(r.error);
    });
  }

  if (!may["org.reviews"]) return null;
  return (
    <div>
      <div className="u-row u-gap-2">
        <button type="button" className={`admin-btn admin-btn--sm${copied ? "" : " admin-btn--primary"}`} onClick={copy} disabled={pending} aria-label={`Copy ${name}`}>
          {copied ? "Copy again" : "Copy link"}
        </button>
        <span className="admin-hint u-m-0" role="status">
          {error ?? (copied ? `Copied ${timeAgo(copied)}${copiedNote ? `. ${copiedNote}` : ""}` : (idleNote ?? "Not copied yet"))}
        </span>
      </div>
      {manual && <input className="admin-input u-mt-2" readOnly value={link} aria-label={name.charAt(0).toUpperCase() + name.slice(1)} onFocus={(e) => e.currentTarget.select()} />}
    </div>
  );
}
