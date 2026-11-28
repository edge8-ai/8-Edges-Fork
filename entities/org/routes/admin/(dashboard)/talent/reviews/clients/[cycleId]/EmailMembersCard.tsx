"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MayProp } from "@/kernel/identity/may-prop";
import { Badge } from "@/kernel/ui/Badge";
import type { MemberEmailResult } from "@/entities/org/lib/client-reviews/member-email";
import type { MemberEmailView } from "@/entities/org/lib/client-reviews/member-email-view";
import { clearMemberEmailAction, markMemberEmailSentAction } from "./email-actions";
import { EmailMembersDialog } from "./EmailMembersDialog";

// The overview's "Email the members" card (CR.5.4): one state, one main
// button, and how many members have sent theirs. Opening the cycle emailed
// nobody, and the form is already in each member's team app and Inbox, so
// this only decides when the email that says so goes, or that the owner sends it
// themselves. Nothing here contacts anyone at the client.
export function EmailMembersCard({ may, cycleId, closed, view }: { may: MayProp; cycleId: string; closed: boolean; view: MemberEmailView }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const can = may["org.reviews"] && !closed;

  function run(action: () => Promise<MemberEmailResult>) {
    setNotice(null);
    startTransition(async () => {
      const r = await action();
      if (r.ok) router.refresh();
      else setNotice(r.error);
    });
  }

  function done(r: MemberEmailResult) {
    setOpen(false);
    // A partial send is the one outcome the refreshed card cannot show.
    setNotice(r.ok && r.outcome === "sent" && r.sent < r.of ? `${r.sent} of ${r.of} emails went. The others have no address, or could not be sent.` : null);
    router.refresh();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(view.message);
      setCopied(true);
    } catch {
      // A browser may refuse the clipboard; the message is then shown to select by hand.
      setShowMessage(true);
    }
  }

  const copyButton = (
    <button type="button" className="admin-btn admin-btn--sm" onClick={copy}>
      {copied ? "Copied" : "Copy the message"}
    </button>
  );
  const change = (
    <button type="button" className="admin-btn admin-btn--sm" onClick={() => setOpen(true)} disabled={pending}>
      Change…
    </button>
  );

  return (
    <section className="admin-card u-p-4" aria-labelledby="cr-email-title">
      <div className="cr-card-head">
        <h2 id="cr-email-title" className="admin-card-title u-m-0">
          Email the members
        </h2>
        <span className="admin-hint u-m-0">Their form is already in the team app and their Inbox. This only emails them.</span>
      </div>
      <div className="cr-plan-state" aria-live="polite">
        {view.state === "none" && (
          <>
            <div className="cr-plan-line">
              <Badge tone="warn">Not emailed yet</Badge>
              <span>{view.recipients === 0 ? "Everyone has sent theirs, so there is nobody to email." : "Nobody has been emailed."}</span>
            </div>
            {can && view.recipients > 0 && (
              <div className="cr-plan-actions">
                <button type="button" className="admin-btn admin-btn--primary" onClick={() => setOpen(true)}>
                  Email the members…
                </button>
              </div>
            )}
          </>
        )}
        {view.state === "legacy" && (
          <div className="cr-plan-line">
            <Badge>Emailed when it opened</Badge>
            <span>This cycle emailed its members when it was opened.</span>
          </div>
        )}
        {view.state === "sent" && (
          <>
            <div className="cr-plan-line">
              <Badge tone="ok">Emailed {view.doneDay}</Badge>
              <span>The members still to send theirs were emailed.</span>
            </div>
            {view.reminderLine && <span className="admin-hint u-m-0">{view.reminderLine}</span>}
          </>
        )}
        {view.state === "scheduled" && (
          <>
            <div className="cr-plan-line">
              <Badge tone="info">Email scheduled</Badge>
              <span>{view.scheduledLabel}.</span>
            </div>
            {view.reminderLine && <span className="admin-hint u-m-0">{view.reminderLine}</span>}
            {can && (
              <div className="cr-plan-actions">
                {change}
                <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={() => run(() => clearMemberEmailAction({ cycleId, expected: view.expected }))}>
                  Don&apos;t send it
                </button>
              </div>
            )}
          </>
        )}
        {view.state === "manual" && (
          <>
            <div className="cr-plan-line">
              <Badge>You&apos;re emailing them</Badge>
              <span>The app sends nothing. Send the message yourself, then mark it sent.</span>
            </div>
            <div className="cr-plan-actions">
              {copyButton}
              {can && (
                <>
                  <button type="button" className="admin-btn admin-btn--sm admin-btn--primary" disabled={pending} onClick={() => run(() => markMemberEmailSentAction({ cycleId }))}>
                    Mark as sent
                  </button>
                  {change}
                </>
              )}
            </div>
          </>
        )}
        {view.state === "manual_sent" && (
          <>
            <div className="cr-plan-line">
              <Badge tone="ok">Emailed by you</Badge>
              <span>You marked it sent, {view.doneDay}. The app sent nothing.</span>
            </div>
            <div className="cr-plan-actions">{copyButton}</div>
          </>
        )}
        {showMessage && <textarea className="admin-input cr-plan-msg" readOnly value={view.message} aria-label="The message to send" onFocus={(e) => e.currentTarget.select()} />}
        {notice && (
          <p className="admin-hint u-m-0" role="alert">
            {notice}
          </p>
        )}
      </div>
      <div className="cr-plan-progress">
        <div className="u-row u-between">
          <strong>
            {view.sentTheirs} of {view.members} sent theirs
          </strong>
          {view.lastSent && (
            <span className="admin-hint u-m-0">
              {view.lastSent.name}, {view.lastSent.day}
            </span>
          )}
        </div>
        <progress value={view.sentTheirs} max={Math.max(view.members, 1)} aria-label={`${view.sentTheirs} of ${view.members} members sent theirs`} />
      </div>
      {open && <EmailMembersDialog may={may} cycleId={cycleId} view={view} onClose={() => setOpen(false)} onDone={done} />}
    </section>
  );
}
