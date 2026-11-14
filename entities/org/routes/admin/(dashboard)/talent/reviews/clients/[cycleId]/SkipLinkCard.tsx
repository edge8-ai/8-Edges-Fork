"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MayProp } from "@/kernel/identity/may-prop";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { timeAgo } from "@/kernel/ui/format";
import { cancelSkipLinkAction, reissueSkipLinkAction, skipLinkCopiedAction } from "./owner-actions";

// The skip-manager's one link to the cycle, on the overview (CR.3.2): copy it
// to send yourself, cancel it, or replace it. Copying happens inside the click,
// because a browser only lets a page write to the clipboard while the gesture
// is live; the time is recorded after. Nothing here sends the link anywhere.
export function SkipLinkCard({
  may,
  cycleId,
  name,
  link,
  copiedAt,
  cancelled,
  closed,
  inCycle,
}: {
  may: MayProp;
  cycleId: string;
  name: string;
  /** The link, whole, while it works and the viewer is not in the cycle. */
  link: string | null;
  copiedAt: string | null;
  cancelled: boolean;
  closed: boolean;
  /** The viewer is reviewed in this cycle, so the link that reaches every member is not theirs to hold. */
  inCycle: boolean;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState<string | null>(copiedAt);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [pending, startTransition] = useTransition();
  if (!may["org.reviews"] || closed) return null;

  async function copy() {
    if (!link) return;
    setError(null);
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      setManual(true);
      setError("Your browser did not allow copying. Select the link below and copy it.");
      return;
    }
    startTransition(async () => {
      const r = await skipLinkCopiedAction({ cycleId });
      if (r.ok) setCopied(r.at);
      else setError(r.error);
    });
  }

  return (
    <div className="u-mt-3">
      {inCycle ? (
        <p className="admin-hint u-m-0">You are reviewed in this cycle, so {name}&apos;s link, which reaches every member, is not shown to you.</p>
      ) : cancelled ? (
        <p className="admin-hint u-m-0">{name}&apos;s link is cancelled: it no longer opens. Issue a new one to send them.</p>
      ) : link ? (
        <div className="u-row u-gap-2 u-wrap">
          <button
            type="button"
            className={`admin-btn admin-btn--sm${copied ? "" : " admin-btn--primary"}`}
            onClick={copy}
            disabled={pending}
            aria-label={`Copy ${name}'s link to every member`}
          >
            {copied ? "Copy again" : "Copy link"}
          </button>
          <span className="admin-hint u-m-0" role="status">
            {copied ? `Copied ${timeAgo(copied)}` : "Not copied yet"}
          </span>
        </div>
      ) : null}
      {manual && link && <input className="admin-input u-mt-2" readOnly value={link} aria-label={`${name}'s link`} onFocus={(e) => e.currentTarget.select()} />}
      {!inCycle && (
        <div className="u-row u-gap-2 u-wrap u-mt-2">
          {!cancelled && (
            <ConfirmButton
              className="admin-btn admin-btn--sm admin-btn--danger"
              label="Cancel link…"
              title={`Cancel ${name}'s link?`}
              body={`The link stops opening at once, for every member. Notes and Reviewed marks ${name} has made so far stay. You can issue a new link afterwards.`}
              confirmLabel="Cancel the link"
              onConfirm={() => cancelSkipLinkAction({ cycleId })}
              onDone={() => router.refresh()}
            />
          )}
          <ConfirmButton
            className="admin-btn admin-btn--sm"
            label="Issue a new link…"
            title={`Issue ${name} a new link?`}
            body={`The link ${name} has stops opening at once, and a new one replaces it for you to copy and send. Their notes and marks so far stay.`}
            confirmLabel="Issue a new link"
            onConfirm={() => reissueSkipLinkAction({ cycleId })}
            onDone={() => router.refresh()}
          />
        </div>
      )}
      <p className="admin-hint u-mt-2 u-mb-0">Copying sends nothing. You send the link to {name} yourself; the app never contacts anyone at the client.</p>
      {error && (
        <p className="admin-hint u-m-0" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
